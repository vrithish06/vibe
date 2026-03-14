import { injectable, inject } from 'inversify';
import {
    JsonController,
    Get,
    Post,
    Put,
    Delete,
    Param,
    Body,
    Authorized,
    CurrentUser,
    QueryParam,
    Req,
    UploadedFile
} from 'routing-controllers';
import multer from 'multer';
import { ActivityService } from '../services/ActivityService.js';
import { CloudStorageService } from '../services/CloudStorageService.js';
import { EnrollmentService } from '#users/services/EnrollmentService.js';
import { IActivity, IUser, AuthenticatedUser } from '#shared/interfaces/models.js';

@JsonController('/activities')
@injectable()
export class ActivityController {
    constructor(
        @inject(ActivityService) private activityService: ActivityService,
        @inject(EnrollmentService) private enrollmentService: EnrollmentService,
        @inject(CloudStorageService) private cloudStorageService: CloudStorageService
    ) { }

    private async buildAuthenticatedUser(user: IUser): Promise<AuthenticatedUser> {
        const userIdStr = (user as any).userId || user._id?.toString() || (user as any).id;
        const rawEnrollments = await this.enrollmentService.getAllEnrollments(userIdStr);
        const authUser = user as unknown as AuthenticatedUser;
        authUser.userId = userIdStr; // Ensure userId is explicitly set as a string
        authUser.enrollments = (rawEnrollments as any[]).map((e) => ({
            courseId: e.courseId?.toString(),
            versionId: e.courseVersionId?.toString(),
            role: e.role,
        }));
        return authUser;
    }

    @Authorized()
    @Post('/')
    async createActivity(
        @CurrentUser() user: IUser,
        @Req() req: any,
        @Body() body: Partial<IActivity>
    ) {
        const authUser = await this.buildAuthenticatedUser(user);
        if (body.deadline) {
            body.deadline = new Date(body.deadline);
        }
        return this.activityService.createActivity(authUser, body, req.session);
    }

    @Authorized()
    @Put('/:id')
    async updateActivity(
        @CurrentUser() user: IUser,
        @Req() req: any,
        @Param('id') id: string,
        @Body() body: Partial<IActivity>
    ) {
        const authUser = await this.buildAuthenticatedUser(user);
        if (body.deadline) {
            body.deadline = new Date(body.deadline);
        }
        return this.activityService.updateActivity(authUser, id, body, req.session);
    }

    @Authorized()
    @Get('/teacher/course/:courseVersionId')
    async getActivitiesForTeacher(
        @CurrentUser() user: IUser,
        @Req() req: any,
        @Param('courseVersionId') courseVersionId: string,
        @QueryParam('cohortId') cohortId?: string
    ) {
        const authUser = await this.buildAuthenticatedUser(user);
        return this.activityService.getActivitiesForTeacher(authUser, courseVersionId, cohortId, req.session);
    }

    @Authorized()
    @Get('/student/course/:courseVersionId')
    async getActivitiesForStudent(
        @CurrentUser() user: IUser,
        @Req() req: any,
        @Param('courseVersionId') courseVersionId: string,
        @QueryParam('cohortId') cohortId?: string
    ) {
        const authUser = await this.buildAuthenticatedUser(user);
        return this.activityService.getActivitiesForStudent(authUser, courseVersionId, cohortId, req.session);
    }

    @Authorized()
    @Get('/:id')
    async getActivityById(
        @CurrentUser() user: IUser,
        @Req() req: any,
        @Param('id') id: string
    ) {
        const authUser = await this.buildAuthenticatedUser(user);
        return this.activityService.getActivityById(authUser, id, req.session);
    }

    @Authorized()
    @Delete('/:id')
    async deleteActivity(
        @CurrentUser() user: IUser,
        @Req() req: any,
        @Param('id') id: string
    ) {
        const authUser = await this.buildAuthenticatedUser(user);
        return this.activityService.deleteActivity(authUser, id, req.session);
    }

    @Authorized()
    @Post('/:id/submit')
    async submitActivity(
        @CurrentUser() user: IUser,
        @Req() req: any,
        @Param('id') id: string,
        @UploadedFile('proof', { options: { storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } } }) file?: Express.Multer.File
    ) {
        const authUser = await this.buildAuthenticatedUser(user);
        let proofUrl: string | undefined = undefined;

        if (file) {
            // Upload to GridFS and get back the file ID (stored as a string on the submission)
            proofUrl = await this.cloudStorageService.uploadActivityProof(
                file,
                authUser.userId,
                id,
                new Date()
            );
        }

        return this.activityService.submitActivity(authUser, id, proofUrl, req.session);
    }

    /**
     * Download a proof file stored in GridFS by its file ID.
     * The fileId is the value stored on the submission's proofUrl field.
     * This endpoint pipes the file stream directly to the HTTP response.
     */
    @Authorized()
    @Get('/proof/:fileId')
    async downloadProof(
        @Param('fileId') fileId: string,
        @Req() req: any,
        res: any
    ) {
        const { stream, metadata } = await this.cloudStorageService.downloadProof(fileId);

        // Set headers so the browser knows what file it's receiving
        req.res.setHeader('Content-Disposition', `inline; filename="${metadata.originalName}"`);
        req.res.setHeader('Content-Type', metadata.contentType);

        // Pipe the GridFS file stream directly to the HTTP response
        return new Promise<void>((resolve, reject) => {
            stream.pipe(req.res);
            stream.on('end', resolve);
            stream.on('error', reject);
        });
    }
}
