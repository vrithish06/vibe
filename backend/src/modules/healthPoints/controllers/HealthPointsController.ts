
import { injectable, inject } from 'inversify';
import {
    JsonController,
    Get,
    Post,
    Body,
    QueryParams,
    Authorized,
    ForbiddenError,
    BadRequestError
} from 'routing-controllers';
import { HealthPointsService } from '../services/HealthPointsService.js';
import { Ability } from '#root/shared/functions/AbilityDecorator.js';
import { getCourseAbility, CourseActions } from '#courses/abilities/courseAbilities.js';
import { subject } from '@casl/ability';
import { HPEventType, HPStatus } from '#shared/interfaces/models.js';
import { IsString, IsNumber, IsEnum, IsNotEmpty } from 'class-validator';

// Request DTOs(data transfer objects)
class GetHealthPointsQuery {
    @IsString() @IsNotEmpty() courseId!: string;
}

class GetStudentHealthPointsQuery {
    @IsString() @IsNotEmpty() courseId!: string;
    @IsString() @IsNotEmpty() studentId!: string;
}

class AddHPEventBody {
    @IsString() @IsNotEmpty() courseId!: string;
    @IsString() @IsNotEmpty() studentId!: string;
    @IsEnum(['BONUS', 'PENALTY', 'MANUAL', 'INITIALIZED']) type!: HPEventType;
    @IsNumber() pointsChange!: number;
    @IsString() @IsNotEmpty() reason!: string;
}

@injectable()
@JsonController('/teacher/courses/healthPoints')
export class HealthPointsController {
    constructor(
        @inject(HealthPointsService) private hpService: HealthPointsService
    ) { }

    @Authorized()
    @Get('/')
    async getCourseHealthPoints(
        @QueryParams() query: GetHealthPointsQuery,
        @Ability(getCourseAbility) { ability }
    ) {
        const { courseId } = query;
        // Check permission - leveraging CourseActions.Modify ensures only Teacher/Manager access
        if (!ability.can(CourseActions.Modify, subject('Course', { courseId }))) {
            throw new ForbiddenError('You do not have permission to view Health Points for this course');
        }

        // TODO: Implement "Get All Students HP" in service/repo if needed.
        // The repository currently has `getHP` (single).
        // I need to add `getAllHP(courseId)` to Service & Repository.
        // For now, I'll return empty list or fail. 
        // Wait, prompt requires "GET — Course-level Health Points Returns List of students".
        // I MUST implement `getAllHP(courseId)` in service/repo.
        return await this.hpService.getAllHealthPoints(courseId);
    }

    @Authorized()
    @Get('/student')
    async getStudentHealthPoints(
        @QueryParams() query: GetStudentHealthPointsQuery,
        @Ability(getCourseAbility) { ability }
    ) {
        const { courseId, studentId } = query;
        if (!ability.can(CourseActions.Modify, subject('Course', { courseId }))) {
            throw new ForbiddenError('You do not have permission to view Health Points for this course');
        }

        const hp = await this.hpService.getHealthPoints(studentId, courseId);
        const events = await this.hpService.getEvents(studentId, courseId);

        return {
            healthPoints: hp,
            events: events
        };
    }

    @Authorized()
    @Post('/events')
    async addEvent(
        @Body() body: AddHPEventBody,
        @Ability(getCourseAbility) { ability, user }
    ) {
        const { courseId, studentId, type, pointsChange, reason } = body;

        if (!ability.can(CourseActions.Modify, subject('Course', { courseId }))) {
            throw new ForbiddenError('You do not have permission to manage Health Points for this course');
        }

        return await this.hpService.addEvent(
            studentId,
            courseId,
            type,
            pointsChange,
            reason,
            user._id.toString()
        );
    }
}
