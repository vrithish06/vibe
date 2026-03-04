import { injectable, inject } from 'inversify';
import { ActivityRepository } from '#shared/database/providers/mongo/repositories/ActivityRepository.js';
import { IActivity, ActivityStatus, RewardType, PenaltyType, SubmissionMode, ActivityType } from '#shared/interfaces/models.js';
import { BadRequestError, NotFoundError, ForbiddenError } from 'routing-controllers';
import { ObjectId, ClientSession } from 'mongodb';
import { AuthenticatedUser } from '#shared/interfaces/models.js';
import { HealthPointsService } from '../../../modules/healthPoints/services/HealthPointsService.js';

@injectable()
export class ActivityService {
    constructor(
        @inject(ActivityRepository) private activityRepo: ActivityRepository,
        @inject(HealthPointsService) private hpService: HealthPointsService
    ) { }

    private validateActivityData(data: Partial<IActivity>) {
        if (data.rewardType === 'PERCENTAGE' && (data.rewardValue! < 0 || data.rewardValue! > 100)) {
            throw new BadRequestError('Percentage reward value must be between 0 and 100');
        }

        if (data.mandatory && data.penaltyType) {
            if (data.penaltyType === 'PERCENTAGE' && (data.penaltyValue! < 0 || data.penaltyValue! > 100)) {
                throw new BadRequestError('Percentage penalty value must be between 0 and 100');
            }
        }

        if (!data.mandatory && data.penaltyType) {
            throw new BadRequestError('Penalty rule is only allowed if mandatory is true');
        }

        if (data.graceRewardPercentage !== undefined && (data.graceRewardPercentage < 0 || data.graceRewardPercentage > 100)) {
            throw new BadRequestError('Grace reward percentage must be between 0 and 100');
        }
    }

    private hasTeacherAccess(user: AuthenticatedUser, courseVersionId: string): boolean {
        // Find if user is enrolled as INSTRUCTOR, MANAGER, TA, STAFF for this version
        const enrollment = user.enrollments.find(e => e.versionId.toString() === courseVersionId.toString());
        if (!enrollment) return false;

        const allowedRoles = ['INSTRUCTOR', 'MANAGER', 'TA', 'STAFF'];
        return allowedRoles.includes(enrollment.role) || user.globalRole === 'admin';
    }

    private hasStudentAccess(user: AuthenticatedUser, courseVersionId: string): boolean {
        const enrollment = user.enrollments.find(e => e.versionId.toString() === courseVersionId.toString());
        return !!enrollment || user.globalRole === 'admin';
    }

    async createActivity(user: AuthenticatedUser, data: Partial<IActivity>, session?: ClientSession) {
        if (!this.hasTeacherAccess(user, data.courseVersionId as string)) {
            throw new ForbiddenError('Only teachers can create activities');
        }

        this.validateActivityData(data);

        // Map status logic: new activities can be Draft or Published based on request, default Draft
        if (!data.status) {
            data.status = 'DRAFT';
        }

        return this.activityRepo.create({
            ...data,
            createdBy: new ObjectId(user.userId)
        }, session);
    }

    async updateActivity(
        user: AuthenticatedUser,
        activityId: string,
        data: Partial<IActivity>,
        session?: ClientSession
    ) {
        const activity = await this.activityRepo.findById(activityId, session);
        if (!activity) {
            throw new NotFoundError('Activity not found');
        }

        if (!this.hasTeacherAccess(user, activity.courseVersionId as string)) {
            throw new ForbiddenError('Only teachers can edit activities');
        }

        if (data.mandatory !== undefined || data.penaltyType !== undefined || data.rewardType !== undefined) {
            const mergedData = { ...activity, ...data };
            this.validateActivityData(mergedData);
        }

        return this.activityRepo.update(activityId, data, session);
    }

    async deleteActivity(
        user: AuthenticatedUser,
        activityId: string,
        session?: ClientSession
    ) {
        const activity = await this.activityRepo.findById(activityId, session);
        if (!activity) {
            throw new NotFoundError('Activity not found');
        }

        if (!this.hasTeacherAccess(user, activity.courseVersionId as string)) {
            throw new ForbiddenError('Only teachers can delete activities');
        }

        return this.activityRepo.delete(activityId, session);
    }

    async getActivitiesForTeacher(
        user: AuthenticatedUser,
        courseVersionId: string,
        cohortId?: string,
        session?: ClientSession
    ) {
        if (!this.hasTeacherAccess(user, courseVersionId)) {
            throw new ForbiddenError('Access denied');
        }

        return this.activityRepo.findByCourseVersion(courseVersionId, { cohortId }, session);
    }

    async getActivitiesForStudent(
        user: AuthenticatedUser,
        courseVersionId: string,
        cohortId?: string,
        session?: ClientSession
    ) {
        if (!this.hasStudentAccess(user, courseVersionId)) {
            throw new ForbiddenError('Access denied');
        }

        // Students only see PUBLISHED or CLOSED activities (if applicable, but prompt says Published only for now. 
        // Wait, prompt: "Students (Published only)".

        return this.activityRepo.findByCourseVersion(
            courseVersionId,
            { status: 'PUBLISHED', cohortId },
            session
        );
    }

    async getActivityById(
        user: AuthenticatedUser,
        activityId: string,
        session?: ClientSession
    ) {
        const activity = await this.activityRepo.findById(activityId, session);
        if (!activity) {
            throw new NotFoundError('Activity not found');
        }

        const isTeacher = this.hasTeacherAccess(user, activity.courseVersionId as string);
        const isStudent = this.hasStudentAccess(user, activity.courseVersionId as string);

        if (!isTeacher && !isStudent) {
            throw new ForbiddenError('Access denied');
        }

        if (isStudent && !isTeacher) {
            if (activity.status === 'DRAFT') {
                throw new ForbiddenError('Activity is not visible');
            }
        }

        return activity;
    }

    async submitActivity(
        user: AuthenticatedUser,
        activityId: string,
        session?: ClientSession
    ) {
        // Get the activity
        const activity = await this.activityRepo.findById(activityId, session);
        if (!activity) {
            throw new NotFoundError('Activity not found');
        }

        // Verify student is enrolled in the course
        if (!this.hasStudentAccess(user, activity.courseVersionId as string)) {
            throw new ForbiddenError('You are not enrolled in this course');
        }

        // Verify activity is published (students can only submit published activities)
        if (activity.status !== 'PUBLISHED') {
            throw new ForbiddenError('This activity is not available for submission');
        }

        // Calculate and award health points (best-effort — don't fail submission if HP errors)
        const courseId = activity.courseId?.toString() || (activity.courseId as any as ObjectId).toString();
        let hpAwarded = 0;

        if (activity.rewardValue != null && activity.rewardValue > 0) {
            try {
                let percentageChange = 0;

                if (activity.rewardType === 'PERCENTAGE') {
                    // Direct percentage reward
                    percentageChange = activity.rewardValue;
                } else {
                    // ABSOLUTE reward: convert HP units to percentage of current HP
                    const currentRecord = await this.hpService.getHealthPoints(user.userId, courseId, session);
                    const currentHP = currentRecord?.currentHP ?? 1000; // default 1000 if not initialized
                    if (currentHP > 0) {
                        percentageChange = (activity.rewardValue / currentHP) * 100;
                    } else {
                        // HP is 0 — treat reward value directly as a percentage point
                        percentageChange = activity.rewardValue;
                    }
                }

                if (percentageChange > 0) {
                    const result = await this.hpService.addEvent(
                        user.userId,
                        courseId,
                        'BONUS',
                        percentageChange,
                        `Activity completion: ${activity.title}`,
                        user.userId,
                        session
                    );
                    // hpAwarded = actual HP gained (new - old)
                    const gained = (result?.currentHP ?? 0) - (result?.previousHP ?? (result?.currentHP ?? 0));
                    hpAwarded = Math.round(Math.abs(gained) * 100) / 100 || activity.rewardValue;
                }
            } catch (hpError: any) {
                console.error(`[ActivityService] HP award failed for user ${user.userId} on activity ${activityId}:`, hpError?.message || hpError);
                // HP error is non-fatal — activity is still counted as submitted
            }
        }

        return {
            success: true,
            message: `Activity "${activity.title}" submitted successfully!`,
            hpAwarded,
            activity: {
                id: activity._id,
                title: activity.title,
                rewardValue: activity.rewardValue,
                rewardType: activity.rewardType
            }
        };
    }
}
