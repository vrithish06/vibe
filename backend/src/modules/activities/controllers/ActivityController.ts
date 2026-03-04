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
    Req
} from 'routing-controllers';
import { ActivityService } from '../services/ActivityService.js';
import { EnrollmentService } from '#users/services/EnrollmentService.js';
import { IActivity, IUser, AuthenticatedUser } from '#shared/interfaces/models.js';

@JsonController('/activities')
@injectable()
export class ActivityController {
    constructor(
        @inject(ActivityService) private activityService: ActivityService,
        @inject(EnrollmentService) private enrollmentService: EnrollmentService
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
        @Param('id') id: string
    ) {
        const authUser = await this.buildAuthenticatedUser(user);
        return this.activityService.submitActivity(authUser, id, req.session);
    }
}
