import { injectable, inject } from 'inversify';
import { ActivityRepository } from '#shared/database/providers/mongo/repositories/ActivityRepository.js';
import { IActivity, ActivityStatus, RewardType, PenaltyType, SubmissionMode, ActivityType } from '#shared/interfaces/models.js';
import { BadRequestError, NotFoundError, ForbiddenError } from 'routing-controllers';
import { ObjectId, ClientSession } from 'mongodb';
import { AuthenticatedUser } from '#shared/interfaces/models.js';
import { HealthPointsService } from '../../../modules/healthPoints/services/HealthPointsService.js';
import { EnrollmentRepository } from '#shared/database/providers/mongo/repositories/EnrollmentRepository.js';

@injectable()
export class ActivityService {
    constructor(
        @inject(ActivityRepository) private activityRepo: ActivityRepository,
        @inject(HealthPointsService) private hpService: HealthPointsService,
        @inject(EnrollmentRepository) private enrollmentRepo: EnrollmentRepository
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

        const activities = await this.activityRepo.findByCourseVersion(
            courseVersionId,
            { status: 'PUBLISHED', cohortId },
            session
        );

        console.log(`[ActivityService] getActivitiesForStudent running for user ${user.userId}`);

        return activities.map(activity => {
            const isComp = activity.submittedUsers?.some(id => {
                const idStr = id.toString();
                const userStr = user.userId.toString();
                return idStr === userStr;
            }) || activity.submissions?.some(sub => sub.userId.toString() === user.userId.toString()) || false;

            return {
                ...activity,
                isCompleted: isComp
            };
        });
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
        proofUrl?: string,
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

        // Check if user already submitted
        const hasSubmitted = activity.submittedUsers?.some(userId => userId.toString() === user.userId);
        if (hasSubmitted) {
            throw new BadRequestError('You have already submitted this activity');
        }

        // Calculate and award health points (best-effort — don't fail submission if HP errors)
        const courseId = activity.courseId?.toString() || (activity.courseId as any as ObjectId).toString();
        let hpAwarded = 0;

        // If HP Assignment mode is MANUAL or it's AUTOMATIC (and will be handled by cron later), we might skip awarding immediately.
        // But for backwards compatibility, if hpAssignmentMode is missing, we still award here.
        // Wait, "if teacher selects it as manual... in automatic mode if dead line is 14 march 12 pm then after 12 pm all students automatically get..."
        // Lets just disable immediate grading if it's MANUAL.
        if (activity.hpAssignmentMode !== 'MANUAL' && activity.hpAssignmentMode !== 'AUTOMATIC' && activity.rewardValue != null && activity.rewardValue > 0) {
            try {
                let pointsChange = 0;

                if (activity.rewardType === 'PERCENTAGE') {
                    // Direct percentage reward - convert to absolute points based on current HP
                    const currentRecord = await this.hpService.getHealthPoints(user.userId, courseId, session);
                    const currentHP = currentRecord?.currentHP ?? 1000;
                    pointsChange = (currentHP * activity.rewardValue) / 100;
                } else {
                    // ABSOLUTE reward
                    pointsChange = activity.rewardValue;
                }

                if (pointsChange > 0) {
                    const result = await this.hpService.addEvent(
                        user.userId,
                        courseId,
                        'BONUS',
                        pointsChange,
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

        // Mark the activity as submitted by this user
        await this.activityRepo.addSubmittedUser(activityId, user.userId, proofUrl, session);

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

    async getSubmissions(
        user: AuthenticatedUser,
        activityId: string,
        session?: ClientSession
    ) {
        const activity = await this.activityRepo.findById(activityId, session);
        if (!activity) {
            throw new NotFoundError('Activity not found');
        }

        if (!this.hasTeacherAccess(user, activity.courseVersionId as string)) {
            throw new ForbiddenError('Only teachers can view submissions');
        }

        return this.activityRepo.getSubmissionsWithUserDetails(activityId, session);
    }

    async gradeSubmissions(
        user: AuthenticatedUser,
        activityId: string,
        grades: { userId: string, hpAwarded: number }[],
        session?: ClientSession
    ) {
        const activity = await this.activityRepo.findById(activityId, session);
        if (!activity) {
            throw new NotFoundError('Activity not found');
        }

        if (!this.hasTeacherAccess(user, activity.courseVersionId as string)) {
            throw new ForbiddenError('Only teachers can grade submissions');
        }

        const courseId = activity.courseId?.toString() || (activity.courseId as any as ObjectId).toString();

        // Process all grades
        for (const grade of grades) {
            // Update submission record
            await this.activityRepo.updateSubmissionGrade(activityId, grade.userId, grade.hpAwarded, session);

            // Give HP to user if hpAwarded > 0
            if (grade.hpAwarded > 0) {
                try {
                    await this.hpService.addEvent(
                        grade.userId,
                        courseId,
                        'BONUS', // or custom event type
                        grade.hpAwarded,
                        `Activity graded: ${activity.title}`,
                        user.userId,
                        session
                    );
                } catch (hpError: any) {
                    console.error(`[ActivityService] HP manual award failed for user ${grade.userId} on activity ${activityId}:`, hpError?.message || hpError);
                }
            }
        }

        return { success: true, message: 'Grades successfully updated.' };
    }

    async processAutomaticActivityHP() {
        const activities = await this.activityRepo.findForAutomaticGrading();
        const now = new Date();

        for (const activity of activities) {
            const deadlineDate = new Date(activity.deadline);
            const gracePeriodHours = activity.gracePeriodDuration || 0;
            const absoluteDeadline = new Date(deadlineDate.getTime() + gracePeriodHours * 60 * 60 * 1000);
            
            const isGracePeriodOver = now > absoluteDeadline;
            const courseId = activity.courseId?.toString() || (activity.courseId as any).toString();
            const courseVersionId = activity.courseVersionId?.toString() || (activity.courseVersionId as any).toString();

            // ── Grade existing submissions ──
            if (activity.submissions && activity.submissions.length > 0) {
                for (const sub of activity.submissions) {
                    if (sub.hpAwarded !== undefined) continue;
                    
                    const submittedAtDate = new Date(sub.submittedAt);
                    const isLate = submittedAtDate > deadlineDate;
                    const isTooLate = submittedAtDate > absoluteDeadline;

                    if (isTooLate) {
                        await this.activityRepo.updateSubmissionGrade(activity._id!, sub.userId, 0);
                        continue;
                    }

                    let pointsChange = 0;
                    if (activity.rewardType === 'PERCENTAGE') {
                        const currentRecord = await this.hpService.getHealthPoints(sub.userId.toString(), courseId);
                        const currentHP = currentRecord?.currentHP ?? 1000;
                        pointsChange = (currentHP * activity.rewardValue) / 100;
                    } else {
                        pointsChange = activity.rewardValue || 0;
                    }

                    if (isLate && activity.mandatory && activity.penaltyType && activity.penaltyValue) {
                        if (activity.penaltyType === 'PERCENTAGE') {
                            pointsChange = pointsChange * (1 - activity.penaltyValue / 100);
                        } else if (activity.penaltyType === 'ABSOLUTE') {
                            pointsChange = pointsChange - activity.penaltyValue;
                        }
                        if (pointsChange < 0) pointsChange = 0;
                    }

                    // Apply graceRewardPercentage if specified instead of penalty (alternative late rule)
                    if (isLate && activity.graceRewardPercentage !== undefined && (!activity.mandatory || !activity.penaltyType)) {
                        pointsChange = pointsChange * (activity.graceRewardPercentage / 100);
                        if (pointsChange < 0) pointsChange = 0;
                    }

                    pointsChange = Math.round(pointsChange * 100) / 100;

                    if (pointsChange > 0) {
                        try {
                            await this.hpService.addEvent(
                                sub.userId.toString(),
                                courseId,
                                'BONUS',
                                pointsChange,
                                `Activity auto-graded: ${activity.title}`,
                                activity.createdBy.toString()
                            );
                            await this.activityRepo.updateSubmissionGrade(activity._id!, sub.userId, pointsChange);
                        } catch (e: any) {
                            console.error(`[ActivityService] Error auto-grading submission for ${sub.userId} on ${activity._id}:`, e);
                        }
                    } else {
                        await this.activityRepo.updateSubmissionGrade(activity._id!, sub.userId, 0);
                    }
                }
            }

            // ── Penalize non-submitters for mandatory activities once grace period is over ──
            if (isGracePeriodOver && activity.mandatory && activity.penaltyType && activity.penaltyValue) {
                try {
                    const enrollments = await this.enrollmentRepo.getEnrollmentsByCourseVersion(courseId, courseVersionId);
                    const submittedUserIds = new Set(
                        (activity.submittedUsers || []).map(id => id.toString())
                    );

                    for (const enrollment of enrollments) {
                        const studentId = enrollment.userId.toString();
                        if (submittedUserIds.has(studentId)) continue;

                        // Check if this student was already penalized (tracked via submission record)
                        const alreadyPenalized = activity.submissions?.some(
                            s => s.userId.toString() === studentId
                        );
                        if (alreadyPenalized) continue;

                        let penaltyAmount = 0;
                        if (activity.penaltyType === 'ABSOLUTE') {
                            penaltyAmount = activity.penaltyValue;
                        } else if (activity.penaltyType === 'PERCENTAGE') {
                            const currentRecord = await this.hpService.getHealthPoints(studentId, courseId);
                            const currentHP = currentRecord?.currentHP ?? 1000;
                            penaltyAmount = (currentHP * activity.penaltyValue) / 100;
                        }

                        penaltyAmount = Math.round(penaltyAmount * 100) / 100;

                        if (penaltyAmount > 0) {
                            try {
                                await this.hpService.addEvent(
                                    studentId,
                                    courseId,
                                    'PENALTY',
                                    -penaltyAmount,
                                    `Missed mandatory activity: ${activity.title}`,
                                    activity.createdBy.toString()
                                );
                                console.log(`[ActivityService] Penalized ${studentId} with -${penaltyAmount} BP for missing ${activity.title}`);
                            } catch (e: any) {
                                console.error(`[ActivityService] Error penalizing ${studentId} for ${activity._id}:`, e);
                            }
                        }
                    }
                } catch (e: any) {
                    console.error(`[ActivityService] Error fetching enrollments for penalty on ${activity._id}:`, e);
                }
            }
            
            if (isGracePeriodOver) {
                await this.activityRepo.markAsAutomaticallyGraded(activity._id!);
            }
        }
    }
}
