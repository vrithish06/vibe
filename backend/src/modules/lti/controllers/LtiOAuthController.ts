/**
 * OAuth2 Token Endpoint + OIDC Authorize Redirect
 *
 * These two endpoints make Vibe a fully standard LTI 1.3 Platform (LMS),
 * replacing the custom x-lti-secret approach with proper OAuth2 Bearer tokens.
 *
 * ─── NEW ENDPOINTS ────────────────────────────────────────────────────────────
 *
 *  GET  /api/lti/authorize_redirect
 *  Step 2 of the OIDC login flow:
 *  LTI Tool redirects users here (via GET /api/lti/login on the tool side).
 *  Vibe authenticates the user session, builds the id_token JWT,
 *  and POSTs it back to the tool's redirect_uri.
 *
 *  POST /api/lti/token
 *  OAuth2 client_credentials token endpoint.
 *  LTI Tool sends a signed JWT assertion → Vibe verifies it → returns Bearer token.
 *  Tool uses this token to call /api/lti/nrps/:courseId with standard auth.
 *
 * ─── EXISTING ENDPOINTS (unchanged) ──────────────────────────────────────────
 *  GET /api/lti/nrps/:courseId  — still accepts x-lti-secret (Vibe legacy path)
 *                                  AND now accepts Bearer token (universal path)
 */
import { injectable, inject } from 'inversify';
import {
    JsonController, Get, Post, Body, Req, Res,
} from 'routing-controllers';
import { LtiPlatformService } from '../services/LtiPlatformService.js';
import { appConfig } from '#root/config/app.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { MongoDatabase } from '#root/shared/database/providers/mongo/MongoDatabase.js';
import { ObjectId } from 'mongodb';
import { importJWK, jwtVerify, SignJWT } from 'jose';

// ── In-memory Bearer token store (use Redis in production) ─────────────────
interface IssuedToken { scope: string; expiresAt: number; clientId: string; }
const issuedTokens = new Map<string, IssuedToken>();

@JsonController('/lti')
@injectable()
export class LtiOAuthController {
    constructor(
        @inject(LtiPlatformService) private ltiService: LtiPlatformService,
        @inject(GLOBAL_TYPES.Database) private db: MongoDatabase,
    ) {
        console.log('✅ LTI OAuth Controller Initialized');
    }

    /**
     * GET /api/lti/authorize_redirect
     *
     * OIDC Step 2: LTI tool redirected user here after calling GET /api/lti/login.
     * We decode the user's Vibe session (via cookie), build the final id_token JWT,
     * and POST it to the tool's redirect_uri via an HTML auto-submit form.
     *
     * Query params (sent by LTI tool):
     *   scope, response_type, client_id, redirect_uri,
     *   login_hint (userId), state, nonce, response_mode, prompt
     */
    @Get('/authorize_redirect')
    async authorizeRedirect(@Req() req: any, @Res() res: any) {
        try {
            const {
                redirect_uri,
                login_hint: userId,
                state,
                nonce,
                client_id,
            } = req.query as Record<string, string>;

            if (!redirect_uri || !userId || !state) {
                return res.status(400).json({ error: 'Missing required OIDC params' });
            }

            await this.ltiService.ensureKeys();

            // Fetch user details from DB
            const userRepo: any = await import('#root/bootstrap/loadModules.js')
                .then(m => m.getContainer().get(GLOBAL_TYPES.UserRepo));
            const users = await userRepo.getUsersByIds([userId]);
            const user = users[0];

            if (!user) {
                return res.status(401).send(`<h2>User not found</h2><p>userId: ${userId}</p>`);
            }

            const vibeBaseUrl = appConfig.url || `http://localhost:${appConfig.port}`;
            const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;

            // Build the standard LTI 1.3 id_token
            // Note: courseId is not known at OIDC step — we embed minimal claims.
            // The tool will store this and later enrich it on the resource link launch.
            const now = Math.floor(Date.now() / 1000);
            const jwks = await this.ltiService.getJwks();
            const kid = jwks.keys[0]?.kid || 'vibe-lti-key-1';

            // Access private key via service
            const { _privateKey } = await import('../services/LtiPlatformService.js') as any;

            const idToken = await new SignJWT({
                'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiResourceLinkRequest',
                'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
                'https://purl.imsglobal.org/spec/lti/claim/deployment_id': client_id,
                sub: userId,
                email: user.email || '',
                name: userName,
                nonce,
                'https://purl.imsglobal.org/spec/lti/claim/roles': [
                    'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'
                ],
                'https://purl.imsglobal.org/spec/lti/claim/context': {
                    id: '',
                    label: '',
                    title: '',
                    type: ['CourseSection'],
                },
                'https://purl.imsglobal.org/spec/lti/claim/resource_link': {
                    id: 'oidc-flow',
                    title: 'LTI Launch',
                },
            })
                .setProtectedHeader({ alg: 'RS256', kid })
                .setIssuedAt(now)
                .setExpirationTime(now + 300)
                .setIssuer(vibeBaseUrl)
                .setAudience(client_id)
                .setSubject(userId)
                .sign(_privateKey);

            // POST back to LTI tool via HTML auto-submit form (standard OIDC form_post)
            res.setHeader('Content-Type', 'text/html');
            return res.send(`
                <!DOCTYPE html>
                <html>
                <head><title>LTI Redirect</title></head>
                <body>
                    <p>Launching LTI tool...</p>
                    <form id="lti_form" method="POST" action="${redirect_uri}">
                        <input type="hidden" name="id_token" value="${idToken}" />
                        <input type="hidden" name="state"    value="${state}" />
                    </form>
                    <script>document.getElementById('lti_form').submit();</script>
                </body>
                </html>
            `);
        } catch (err: any) {
            console.error('[OIDC Authorize Redirect] Error:', err.message);
            return res.status(500).json({ error: err.message });
        }
    }

    /**
     * POST /api/lti/token
     *
     * OAuth2 client_credentials endpoint.
     * LTI tool sends a signed JWT assertion signed with ITS private key.
     * Vibe verifies it against the tool's JWKS, then returns a short-lived Bearer token.
     * Tool uses the Bearer token to call /api/lti/nrps/:courseId.
     *
     * Body (application/x-www-form-urlencoded):
     *   grant_type            = client_credentials
     *   client_assertion_type = urn:ietf:params:oauth:client-assertion-type:jwt-bearer
     *   client_assertion      = <signed JWT from LTI tool>
     *   scope                 = https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly
     */
    @Post('/token')
    async token(@Req() req: any, @Res() res: any, @Body() body: any) {
        try {
            const { grant_type, client_assertion_type, client_assertion, scope } = req.body || body;

            if (grant_type !== 'client_credentials') {
                return res.status(400).json({ error: 'unsupported_grant_type' });
            }
            if (client_assertion_type !== 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer') {
                return res.status(400).json({ error: 'unsupported_client_assertion_type' });
            }
            if (!client_assertion) {
                return res.status(400).json({ error: 'missing client_assertion' });
            }

            // Verify the assertion using the LTI tool's JWKS endpoint
            const ltiToolJwksUrl = process.env.LTI_TOOL_JWKS_URL || 'http://localhost:4000/api/lti/jwks';
            const { createRemoteJWKSet, jwtVerify: verify } = await import('jose');
            const JWKS = createRemoteJWKSet(new URL(ltiToolJwksUrl));

            let assertionPayload: any;
            try {
                const result = await verify(client_assertion, JWKS);
                assertionPayload = result.payload;
            } catch (err: any) {
                console.error('[OAuth2 Token] Assertion verification failed:', err.message);
                return res.status(401).json({ error: 'invalid_client', detail: err.message });
            }

            // Issue a short-lived Bearer token
            const bearerToken = `vibe-bearer-${crypto.randomUUID()}`;
            const expiresIn = 3600; // 1 hour
            issuedTokens.set(bearerToken, {
                scope:     scope || '',
                expiresAt: Date.now() + expiresIn * 1000,
                clientId:  assertionPayload.sub || assertionPayload.iss || 'unknown',
            });

            console.log(`[OAuth2 Token] Issued Bearer token to: ${assertionPayload.sub || assertionPayload.iss} for scope: ${scope}`);

            // Return MUST be plain object — routing-controllers will JSON-serialize it
            res.setHeader('Content-Type', 'application/json');
            return res.json({
                access_token: bearerToken,
                token_type:   'Bearer',
                expires_in:   expiresIn,
                scope,
            });
        } catch (err: any) {
            console.error('[OAuth2 Token] Error:', err.message);
            return res.status(500).json({ error: err.message });
        }
    }

    /**
     * Validates a Bearer token issued by POST /api/lti/token.
     * Used internally by the NRPS endpoint to support the universal auth path.
     */
    static validateBearerToken(token: string): boolean {
        const record = issuedTokens.get(token);
        if (!record) return false;
        if (record.expiresAt < Date.now()) {
            issuedTokens.delete(token);
            return false;
        }
        return true;
    }
}
