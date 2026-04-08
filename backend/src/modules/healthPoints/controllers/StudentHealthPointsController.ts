import { injectable, inject } from 'inversify';
import {
    JsonController,
    Get,
    QueryParams,
    Authorized,
    ForbiddenError
} from 'routing-controllers';
import { HealthPointsService } from '../services/HealthPointsService.js';
import { Ability } from '#root/shared/functions/AbilityDecorator.js';
import { getCourseAbility, CourseActions } from '#courses/abilities/courseAbilities.js';
import { subject } from '@casl/ability';
import { IsString, IsNotEmpty } from 'class-validator';
import { LtiSyncService } from '#shared/services/LtiSyncService.js';

class GetStudentHealthPointsQuery {
    @IsString() @IsNotEmpty() courseId!: string;
}

@injectable()
@JsonController('/student/courses/healthPoints')
export class StudentHealthPointsController {
    constructor(
        @inject(HealthPointsService) private hpService: HealthPointsService,
        @inject(LtiSyncService) private ltiSync: LtiSyncService
    ) { }

    @Authorized()
    @Get('/')
    async getHealthPoints(
        @QueryParams() query: GetStudentHealthPointsQuery,
        @Ability(getCourseAbility) { ability, user }: any
    ) {
        try {
            const { courseId } = query;
            if (!ability.can(CourseActions.View, subject('Course', { courseId }))) {
                throw new ForbiddenError('You do not have permission to view Health Points for this course');
            }

            const studentId = user._id.toString();

            const hp = await this.hpService.getHealthPoints(studentId, courseId);
            const events = await this.hpService.getEvents(studentId, courseId);

            const allHPs = await this.hpService.getAllHealthPoints(courseId);
            const validHPs = allHPs.filter(record => record && record.currentHP !== undefined && record.currentHP !== null);
            const averageHP = validHPs.length > 0
                ? Math.round(validHPs.reduce((acc, curr) => acc + curr.currentHP, 0) / validHPs.length)
                : 100;

            return {
                healthPoints: hp,
                events: events,
                averageHP
            };
        } catch (e: any) {
            console.error("DEBUG ERROR in getHealthPoints:", e);
            throw e;
        }
    }

    /**
     * GET /student/courses/healthPoints/external?courseId=<id>
     *
     * Returns Brownie Points from the LTI backend.
     * Called by the frontend when a course has `useExternalBP = true`.
     * If the LTI system has no record for this student/course yet, returns
     * { browniePoints: null } so the frontend can display an appropriate message.
     */
    @Authorized()
    @Get('/external')
    async getBrowniePointsFromLti(
        @QueryParams() query: GetStudentHealthPointsQuery,
        @Ability(getCourseAbility) { ability, user }: any
    ) {
        const { courseId } = query;
        if (!ability.can(CourseActions.View, subject('Course', { courseId }))) {
            throw new ForbiddenError('You do not have permission to view Health Points for this course');
        }

        const studentId = user._id.toString();
        const bp = await this.ltiSync.getBrowniePoints(studentId, courseId);

        return {
            source: 'LTI',
            courseId,
            studentId,
            browniePoints: bp,
        };
    }
}
