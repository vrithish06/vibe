import { injectable, inject } from 'inversify';
import {
    JsonController,
    Get,
    Post,
    Body,
    Authorized,
    CurrentUser,
    Res,
    Req,
    UnauthorizedError,
    Param,
} from 'routing-controllers';
import { LtiPlatformService, LtiLaunchPayload } from '../services/LtiPlatformService.js';
import { IUser } from '#shared/interfaces/models.js';
import { appConfig } from '#root/config/app.js';
import { GLOBAL_TYPES } from '#root/types.js';
import type { IUserRepository } from '#root/shared/index.js';
import { MongoDatabase } from '#root/shared/database/providers/mongo/MongoDatabase.js';
import { ObjectId } from 'mongodb';

@JsonController('/lti')
@injectable()
export class LtiPlatformController {
    constructor(
        @inject(LtiPlatformService) private ltiPlatformService: LtiPlatformService,
        @inject(GLOBAL_TYPES.Database) private db: MongoDatabase,
    ) { 
        console.log('✅ LTI Platform Controller Initialized');
    }

    /**
     * GET /api/lti/ping
     */
    @Get('/ping')
    async ping() {
        return { status: 'LTI Controller is alive' };
    }

    /**
     * GET /api/lti/nrps/:courseId
     */
    @Get('/nrps/:courseId')
    async getNrpsRoster(@Req() req: any, @Param('courseId') courseId: string) {
        console.log(`[Vibe] Incoming NRPS request for course: ${courseId}`);
        const secret = req.headers['x-lti-secret'];
        const expected = process.env.LTI_SHARED_SECRET || 'vibe-lti-shared-secret-change-in-production';

        if (!secret || secret !== expected) {
            console.error('[Vibe] NRPS Auth failed: Secret mismatch');
            throw new UnauthorizedError('Invalid or missing x-lti-secret header');
        }

        const enrollmentCollection = await this.db.getCollection<any>('enrollment');
        const courseCollection = await this.db.getCollection<any>('newCourse');
        
        const course = await courseCollection.findOne({ _id: new ObjectId(courseId) });
        const courseName = course?.name || 'Unknown Course';

        const enrollments = await enrollmentCollection
            .find({
                courseId: new ObjectId(courseId),
                role: 'STUDENT',
                status: 'ACTIVE',
                isDeleted: { $ne: true },
            })
            .project({ userId: 1, _id: 0 })
            .toArray();

        // Get user repo from di container to ensure correctly typed queries
        const userRepo: any = req.container?.get(GLOBAL_TYPES.UserRepo) 
            || (await import('#root/bootstrap/loadModules.js').then(m => m.getContainer().get(GLOBAL_TYPES.UserRepo)));

        const stringIds = enrollments.map((e: any) => e.userId.toString());
        const users = await userRepo.getUsersByIds(stringIds);

        const members = users.map((u: any) => ({
            userId: u._id.toString(),
            name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Unknown Student',
            email: u.email || '',
        }));

        console.log(`[Vibe] NRPS returning ${members.length} members for course ${courseName} (${courseId})`);
        return { members, courseName };
    }

    /**
     * GET /api/lti/jwks
     */
    @Get('/jwks')
    async getJwks() {
        return this.ltiPlatformService.getJwks();
    }

    /**
     * POST /api/lti/launch/:toolId/:activityId
     */
    @Authorized()
    @Post('/launch/:toolId/:activityId')
    async launch(
        @CurrentUser() user: IUser,
        @Req() req: any,
        @Body() body: {
            courseId: string;
            courseVersionId: string;
            activityTitle: string;
            role?: 'Learner' | 'Instructor';
        }
    ) {
        const toolId = req.params.toolId;
        const activityId = req.params.activityId;

        let tool = this.ltiPlatformService.getToolById(toolId);
        if (!tool) {
            tool = {
                _id: toolId,
                name: 'Auto Discovered Tool',
                launchUrl: 'http://localhost:5174/',
                clientId: 'auto-client',
                createdAt: new Date(),
            };
        }

        const userId = (user as any).userId || user._id?.toString();
        const userEmail = (user as any).email || '';
        const userName = `${(user as any).firstName || ''} ${(user as any).lastName || ''}`.trim() || (user as any).name || (user as any).fullName || (body.role === 'Instructor' ? 'Instructor' : 'Student');
        const vibeBaseUrl = appConfig.url || `http://localhost:${appConfig.port}`;

        const payload: LtiLaunchPayload = {
            userId,
            userEmail,
            userName,
            courseId: body.courseId,
            courseVersionId: body.courseVersionId,
            activityId,
            activityTitle: body.activityTitle,
            role: body.role || 'Learner',
            toolId,
        };

        const token = await this.ltiPlatformService.generateLaunchToken(payload, vibeBaseUrl);

        return {
            success: true,
            launchUrl: tool.launchUrl,
            token,
        };
    }

    /**
     * POST /api/lti/student-bp-launch/:courseId
     * Generates an LTI token for a student to view their Brownie Points dashboard.
     */
    @Authorized()
    @Post('/student-bp-launch/:courseId')
    async studentBpLaunch(
        @CurrentUser() user: IUser,
        @Req() req: any,
    ) {
        const courseId = req.params.courseId;

        const tool = {
            launchUrl: 'http://localhost:5174/',
        };

        const userId = (user as any).userId || user._id?.toString();
        const userEmail = (user as any).email || '';
        const userName = `${(user as any).firstName || ''} ${(user as any).lastName || ''}`.trim() || 'Student';
        const vibeBaseUrl = appConfig.url || `http://localhost:${appConfig.port}`;

        const payload: LtiLaunchPayload = {
            userId,
            userEmail,
            userName,
            courseId,
            courseVersionId: '',
            activityId: 'bp-student-view',
            activityTitle: 'Brownie Points',
            role: 'Learner',
            toolId: 'bp-tool',
        };

        const token = await this.ltiPlatformService.generateLaunchToken(payload, vibeBaseUrl);

        return {
            success: true,
            launchUrl: tool.launchUrl,
            token,
        };
    }

    /**
     * POST /api/lti/deep-link-launch/:toolId
     */
    @Authorized()
    @Post('/deep-link-launch/:toolId')
    async deepLinkLaunch(
        @CurrentUser() user: IUser,
        @Req() req: any,
        @Body() body: { courseId: string; courseVersionId: string; activityTitle?: string; }
    ) {
        const toolId = req.params.toolId;
        let tool = this.ltiPlatformService.getToolById(toolId);
        if (!tool) {
            tool = {
                _id: toolId,
                name: 'Auto Discovered Tool',
                launchUrl: 'http://localhost:5174/',
                clientId: 'auto-client',
                createdAt: new Date(),
            };
        }

        const userId = (user as any).userId || user._id?.toString();
        const userEmail = (user as any).email || '';
        const userName = `${(user as any).firstName || ''} ${(user as any).lastName || ''}`.trim() || (user as any).name || (user as any).fullName || 'Instructor';
        const vibeBaseUrl = appConfig.url || `http://localhost:${appConfig.port}`;

        const payload = {
            userId,
            userEmail,
            userName,
            courseId: body.courseId,
            courseVersionId: body.courseVersionId,
            toolId,
            activityTitle: body.activityTitle || ''
        };

        const token = await this.ltiPlatformService.generateDeepLinkingToken(payload, vibeBaseUrl);

        return {
            success: true,
            launchUrl: tool.launchUrl,
            token,
        };
    }

    /**
     * POST /api/lti/deep-link-return/:toolId/:courseId/:courseVersionId
     */
    @Post('/deep-link-return/:toolId/:courseId/:courseVersionId')
    async deepLinkReturn(@Req() req: any, @Res() res: any, @Body() body: any) {
        const JWT = body.JWT;
        let parsedPayload: any = {};
        if (JWT) {
            try {
                parsedPayload = JSON.parse(JWT);
            } catch (e) {
                parsedPayload = typeof JWT === 'string' ? { raw: JWT } : JWT;
            }
        }

        const items = parsedPayload?.['https://purl.imsglobal.org/spec/lti-dl/claim/content_items'] || [];
        const selectedItem = items[0] || { title: 'LTI Activity' };

        if (req.headers.accept && req.headers.accept.includes('application/json')) {
             return { success: true, item: selectedItem };
        }

        res.setHeader('Content-Type', 'text/html');
        return res.send(`
            <script>
                if (window.opener) {
                    window.opener.postMessage({
                        type: 'LTI_DEEP_LINK_SUCCESS',
                        payload: ${JSON.stringify(selectedItem)}
                    }, '*');
                    window.close();
                } else {
                    alert('Content linked. Please close this window.');
                }
            </script>
        `);
    }
}
