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

class GetStudentHealthPointsQuery {
    @IsString() @IsNotEmpty() courseId!: string;
}

@injectable()
@JsonController('/student/courses/healthPoints')
export class StudentHealthPointsController {
    constructor(
        @inject(HealthPointsService) private hpService: HealthPointsService
    ) { }

    @Authorized()
    @Get('/')
    async getHealthPoints(
        @QueryParams() query: GetStudentHealthPointsQuery,
        @Ability(getCourseAbility) { ability, user }: any
    ) {
        try {
            const { courseId } = query;
            // Check permission - leveraging CourseActions.View ensures enrolled students can access
            if (!ability.can(CourseActions.View, subject('Course', { courseId }))) {
                throw new ForbiddenError('You do not have permission to view Health Points for this course');
            }

            const studentId = user._id.toString();

            const hp = await this.hpService.getHealthPoints(studentId, courseId);
            const events = await this.hpService.getEvents(studentId, courseId);

            // Calculate average HP
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
            throw e; // We want to see this in logs, or return it? Wait, let's keep throwing it so the user sees it if we fix it.
            // Wait, I am returning it as 500 still? Let's just return it as a 200 payload with debug details so I can fetch it without Auth!? 
            // NO, we need Auth to reach here. So we can't test it via curl without a token anyway!
        }
    }
}
