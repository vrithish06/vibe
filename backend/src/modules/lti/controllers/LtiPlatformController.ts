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
import { ActivityService } from '#root/modules/activities/services/ActivityService.js';
import { MongoDatabase } from '#root/shared/database/providers/mongo/MongoDatabase.js';
import { ObjectId } from 'mongodb';

@JsonController('/lti')
@injectable()
export class LtiPlatformController {
    constructor(
        @inject(LtiPlatformService) private ltiPlatformService: LtiPlatformService,
        @inject(ActivityService) private activityService: ActivityService,
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

        // ── Auth: accept EITHER x-lti-secret (Vibe legacy) OR Bearer token (universal) ──
        const secret   = req.headers['x-lti-secret'] as string | undefined;
        const authHeader = req.headers['authorization'] as string | undefined;
        const expected = process.env.LTI_SHARED_SECRET || 'vibe-lti-shared-secret-change-in-production';

        let authorized = false;
        if (secret && secret === expected) {
            authorized = true; // Vibe legacy path
        } else if (authHeader?.startsWith('Bearer ')) {
            const bearerToken = authHeader.split(' ')[1];
            // Import validateBearerToken from the OAuth controller
            const { LtiOAuthController } = await import('./LtiOAuthController.js');
            authorized = LtiOAuthController.validateBearerToken(bearerToken);
        }

        if (!authorized) {
            console.error('[Vibe] NRPS Auth failed: neither x-lti-secret nor valid Bearer token');
            throw new UnauthorizedError('Unauthorized — provide x-lti-secret or a valid Bearer token');
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
            .project({ userId: 1, percentCompleted: 1, _id: 0 })
            .toArray();

        // Build a quick lookup map: userId → percentCompleted
        const progressMap: Record<string, number> = {};
        for (const e of enrollments) {
            progressMap[e.userId.toString()] = e.percentCompleted ?? 0;
        }

        // Get user repo from di container to ensure correctly typed queries
        const userRepo: any = req.container?.get(GLOBAL_TYPES.UserRepo) 
            || (await import('#root/bootstrap/loadModules.js').then(m => m.getContainer().get(GLOBAL_TYPES.UserRepo)));

        const stringIds = enrollments.map((e: any) => e.userId.toString());
        const users = await userRepo.getUsersByIds(stringIds);

        const members = users.map((u: any) => {
            const uid = u._id.toString();
            return {
                userId: uid,
                studentId: uid,
                studentName: `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Unknown Student',
                studentEmail: u.email || '',
                name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Unknown Student',
                email: u.email || '',
                percentCompleted: progressMap[uid] ?? 0,
            };
        });

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
        const userEmail = (user as any).email || 'Unknown Email';
        let extractedName = `${(user as any).firstName || ''} ${(user as any).lastName || ''}`.trim();
        if (!extractedName || extractedName.toLowerCase() === 'student') extractedName = (user as any).name || (user as any).fullName || '';
        if (!extractedName || extractedName.toLowerCase() === 'student') extractedName = userEmail !== 'Unknown Email' ? userEmail.split('@')[0] : '';
        
        // ── Robust Role Resolution via Database Enrollment ──
        let resolvedRole: 'Learner' | 'Instructor' = body.role || 'Learner';
        let fetchedCourseName = '';
        try {
            if (body.courseId && userId) {
                const enrollmentCollection = await this.db.getCollection<any>('enrollment');
                const enrollment = await enrollmentCollection.findOne({
                    courseId: new ObjectId(body.courseId),
                    userId: new ObjectId(userId),
                    isDeleted: { $ne: true },
                    status: 'ACTIVE'
                });
                if (enrollment) {
                    if (['INSTRUCTOR', 'MANAGER', 'TA'].includes(enrollment.role)) {
                        resolvedRole = 'Instructor';
                    } else if (enrollment.role === 'STUDENT') {
                        resolvedRole = 'Learner';
                    }
                }
                
                const courseCollection = await this.db.getCollection<any>('newCourse');
                const course = await courseCollection.findOne({ _id: new ObjectId(body.courseId) });
                if (course) fetchedCourseName = course.name;
            }
        } catch(e) { console.error('[LTI Launch] Failed to fetch db role/course details:', e); }

        const userName = extractedName || (resolvedRole === 'Instructor' ? 'Instructor' : 'Student');
        const vibeBaseUrl = appConfig.url || `http://localhost:${appConfig.port}`;

        const payload: LtiLaunchPayload = {
            userId,
            userEmail,
            userName,
            courseId: body.courseId,
            courseName: fetchedCourseName,
            courseVersionId: body.courseVersionId,
            activityId,
            activityTitle: body.activityTitle,
            role: resolvedRole,
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
        const userEmail = (user as any).email || 'Unknown Email';
        let extractedName = `${(user as any).firstName || ''} ${(user as any).lastName || ''}`.trim();
        if (!extractedName || extractedName.toLowerCase() === 'student') extractedName = (user as any).name || (user as any).fullName || '';
        if (!extractedName || extractedName.toLowerCase() === 'student') extractedName = userEmail !== 'Unknown Email' ? userEmail.split('@')[0] : '';
        const userName = extractedName || 'Student';
        const vibeBaseUrl = appConfig.url || `http://localhost:${appConfig.port}`;

        let fetchedCourseName = '';
        try {
            if (courseId) {
                const courseCollection = await this.db.getCollection<any>('newCourse');
                const course = await courseCollection.findOne({ _id: new ObjectId(courseId) });
                if (course) fetchedCourseName = course.name;
            }
        } catch(e) { console.error('[LTI Launch] Failed to fetch db course details:', e); }

        const payload: LtiLaunchPayload = {
            userId,
            userEmail,
            userName,
            courseId,
            courseName: fetchedCourseName,
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
        const userEmail = (user as any).email || 'Unknown Email';
        let extractedName = `${(user as any).firstName || ''} ${(user as any).lastName || ''}`.trim();
        if (!extractedName || extractedName.toLowerCase() === 'student') extractedName = (user as any).name || (user as any).fullName || '';
        if (!extractedName || extractedName.toLowerCase() === 'student') extractedName = userEmail !== 'Unknown Email' ? userEmail.split('@')[0] : '';
        
        let resolvedRole: 'Learner' | 'Instructor' = 'Instructor';
        try {
            if (body.courseId && userId) {
                const enrollmentCollection = await this.db.getCollection<any>('enrollment');
                const enrollment = await enrollmentCollection.findOne({
                    courseId: new ObjectId(body.courseId),
                    userId: new ObjectId(userId),
                    isDeleted: { $ne: true },
                    status: 'ACTIVE'
                });
                if (enrollment) {
                    if (['INSTRUCTOR', 'MANAGER', 'TA'].includes(enrollment.role)) {
                        resolvedRole = 'Instructor';
                    } else if (enrollment.role === 'STUDENT') {
                        resolvedRole = 'Learner';
                    }
                }
            }
        } catch(e) { console.error('[LTI DeepLink] Failed to fetch db role:', e); }

        const userName = extractedName || resolvedRole;
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

        // ── Shift existing activities to LTI (Batch Migration) ──
        try {
            const existingActivities = await this.activityService.getActivitiesForTeacher(
                (user as any), 
                body.courseVersionId
            );
            
            if (existingActivities && existingActivities.length > 0) {
                console.log(`[LTI Migration] Detected ${existingActivities.length} activities to sync for course ${body.courseId}`);
                
                // We'll re-use the existing sync mechanism in ActivityService
                // This is slightly redundant but ensures consistency between Vibe and LTI entries.
                for (const activity of existingActivities) {
                    await this.activityService.updateActivity(
                      (user as any), 
                      (activity._id as any).toString(), 
                      {} // Empty update triggers a re-sync via updateActivity's logic
                    ).catch(syncErr => console.error(`[Migration] Sync failed for ${activity.title}:`, syncErr.message));
                }
            }
        } catch (migErr: any) {
            console.error('[LTI Migration] Global failure:', migErr.message);
        }

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
        const vibeCourseUrl = `${process.env.VIBE_FRONTEND_URL || 'http://localhost:5173'}/teacher/courses/view`;
        
        return res.send(`
            <script>
                if (window.opener) {
                    window.opener.postMessage({
                        type: 'LTI_DEEP_LINK_SUCCESS',
                        payload: ${JSON.stringify(selectedItem)}
                    }, '*');
                    window.close();
                } else {
                    // Same-window case mapping: redirect back to Vibe course page
                    window.location.href = "${vibeCourseUrl}";
                }
            </script>
        `);
    }
}
