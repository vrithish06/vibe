import { injectable } from 'inversify';
import { generateKeyPair, exportJWK, importJWK, SignJWT } from 'jose';
import { ObjectId } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

export interface LtiTool {
    _id?: string;
    name: string;
    launchUrl: string;
    clientId: string;
    description?: string;
    createdAt: Date;
}

export interface LtiLaunchPayload {
    userId: string;
    userEmail: string;
    userName: string;
    courseId: string;
    courseName?: string;
    courseVersionId: string;
    activityId: string;
    activityTitle: string;
    role: 'Learner' | 'Instructor';
    toolId: string;
}

let _privateKey: any = null;
let _publicKey: any = null;
let _publicJwk: any = null;

// In-memory store for registered tools (in production you'd store these in MongoDB)
const registeredTools: Map<string, LtiTool> = new Map();

// ── Persistent key helpers ────────────────────────────────────────────────────
// We persist the JWK pair as JSON next to the .env file so that tokens remain
// valid across VIBE backend hot-reloads (tsx watch re-requires this module,
// which would otherwise regenerate keys on every restart).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEY_FILE = path.resolve(__dirname, '../../../../lti-keys.json');

async function loadOrGenerateKeys() {
    try {
        if (fs.existsSync(KEY_FILE)) {
            const { privateJwk, publicJwk } = JSON.parse(fs.readFileSync(KEY_FILE, 'utf-8'));
            // Import private key for signing; re-use the stored JWK for JWKS endpoint
            _privateKey = await importJWK(privateJwk, 'RS256');
            _publicJwk  = { ...publicJwk, kid: 'vibe-lti-key-1', use: 'sig', alg: 'RS256' };
            console.log('[LTI] Loaded existing RSA key pair from disk.');
            return;
        }
    } catch (e) {
        console.warn('[LTI] Could not load existing key pair, generating a new one:', (e as Error).message);
    }

    // Generate new key pair and persist it
    const { privateKey, publicKey } = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true });
    _privateKey = privateKey;
    _publicKey  = publicKey;
    _publicJwk  = await exportJWK(publicKey);
    _publicJwk.kid = 'vibe-lti-key-1';
    _publicJwk.use = 'sig';
    _publicJwk.alg = 'RS256';

    const privateJwk = await exportJWK(privateKey);
    try {
        fs.writeFileSync(KEY_FILE, JSON.stringify({ privateJwk, publicJwk: _publicJwk }, null, 2));
        console.log('[LTI] Generated and persisted new RSA key pair to disk.');
    } catch (e) {
        console.warn('[LTI] Could not persist key pair to disk:', (e as Error).message);
    }
}

@injectable()
export class LtiPlatformService {

    async ensureKeys() {
        if (!_privateKey) {
            await loadOrGenerateKeys();
        }
    }

    async getJwks() {
        await this.ensureKeys();
        return { keys: [_publicJwk] };
    }

    /**
     * Register a new LTI tool
     */
    registerTool(data: Omit<LtiTool, '_id' | 'createdAt'>): LtiTool {
        const id = new ObjectId().toHexString();
        const tool: LtiTool = {
            _id: id,
            ...data,
            createdAt: new Date(),
        };
        registeredTools.set(id, tool);
        return tool;
    }

    /**
     * Get all registered tools
     */
    listTools(): LtiTool[] {
        return Array.from(registeredTools.values());
    }

    /**
     * Get a single tool by ID
     */
    getToolById(toolId: string): LtiTool | undefined {
        return registeredTools.get(toolId);
    }

    /**
     * Generate a signed LTI 1.3 JWT for launching the external tool.
     * This is what Vibe sends to lTI_System so it knows who the student is.
     */
    async generateLaunchToken(payload: LtiLaunchPayload, vibeBaseUrl: string): Promise<string> {
        await this.ensureKeys();

        const now = Math.floor(Date.now() / 1000);

        const jwt = await new SignJWT({
            // Standard LTI 1.3 claims
            'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiResourceLinkRequest',
            'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
            'https://purl.imsglobal.org/spec/lti/claim/deployment_id': payload.toolId,

            // User identity
            sub: payload.userId,
            email: payload.userEmail,
            name: payload.userName,

            // Context (course)
            'https://purl.imsglobal.org/spec/lti/claim/context': {
                id: payload.courseVersionId,
                label: payload.courseId,
                title: payload.courseName,
                type: ['CourseSection'],
            },

            // Resource link (activity)
            'https://purl.imsglobal.org/spec/lti/claim/resource_link': {
                id: payload.activityId,
                title: payload.activityTitle,
            },

            // Role
            'https://purl.imsglobal.org/spec/lti/claim/roles': [
                payload.role === 'Instructor'
                    ? 'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'
                    : 'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner',
            ],

            // AGS (grade passback) endpoint so the tool knows where to send scores
            'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint': {
                scope: ['https://purl.imsglobal.org/spec/lti-ags/scope/score'],
                lineitem: `${vibeBaseUrl}/api/lti/ags/${payload.toolId}/scores`,
            },

            // NRPS (roster sync) — standard claim telling the tool where to fetch members.
            // Tool uses POST /api/lti/token to get a Bearer token, then calls this URL.
            'https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice': {
                context_memberships_url: `${vibeBaseUrl}/api/lti/nrps/${payload.courseId}`,
                service_versions: ['2.0'],
            },
        })
            .setProtectedHeader({ alg: 'RS256', kid: 'vibe-lti-key-1' })
            .setIssuedAt(now)
            .setExpirationTime(now + 300) // 5 minutes
            .setIssuer(vibeBaseUrl)
            .setAudience(payload.toolId)
            .setSubject(payload.userId)
            .sign(_privateKey);

        return jwt;
    }

    /**
     * Generate a signed LTI 1.3 JWT for Deep Linking (Content Selection).
     * Used when a teacher wants to select or create content in the external tool.
     */
    async generateDeepLinkingToken(payload: Omit<LtiLaunchPayload, 'activityId' | 'role'> & { activityTitle?: string }, vibeBaseUrl: string): Promise<string> {
        await this.ensureKeys();

        const now = Math.floor(Date.now() / 1000);

        const jwt = await new SignJWT({
            'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiDeepLinkingRequest',
            'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
            'https://purl.imsglobal.org/spec/lti/claim/deployment_id': payload.toolId,
            sub: payload.userId,
            email: payload.userEmail,
            name: payload.userName,
            'https://purl.imsglobal.org/spec/lti/claim/roles': [
                'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'
            ],
            // Add context (course) so the tool knows where it's being launched from
            'https://purl.imsglobal.org/spec/lti/claim/context': {
                id: payload.courseVersionId,
                label: payload.courseId,
                type: ['CourseSection'],
            },
            'https://vibe.learning/custom_claims/activity_title': payload.activityTitle,
            'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings': {
                deep_link_return_url: `${vibeBaseUrl}/api/lti/deep-link-return/${payload.toolId}/${payload.courseId}/${payload.courseVersionId}`,
                accept_types: ['ltiResourceLink'],
                accept_presentation_document_targets: ['iframe', 'window']
            }
        })
            .setProtectedHeader({ alg: 'RS256', kid: 'vibe-lti-key-1' })
            .setIssuedAt(now)
            .setExpirationTime(now + 300)
            .setIssuer(vibeBaseUrl)
            .setAudience(payload.toolId)
            .setSubject(payload.userId)
            .sign(_privateKey);

        return jwt;
    }
}
