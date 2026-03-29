import { injectable, inject } from 'inversify';
import { HealthPointsService } from '#root/modules/healthPoints/services/HealthPointsService.js';
import { ActivityService } from '#root/modules/activities/services/ActivityService.js';

export interface LtiScorePayload {
    userId: string;        // Vibe student userId
    courseId: string;      // Vibe courseId
    activityId: string;    // Vibe activityId (for logging)
    activityTitle: string; // Human-readable title
    toolId: string;        // Which LTI tool sent this
    scoreGiven: number;    // Score from the tool (0 - scoreMaximum)
    scoreMaximum: number;  // Max possible score
    comment?: string;      // Optional note from tool
}

@injectable()
export class LtiGradeService {
    constructor(
        @inject(HealthPointsService) private hpService: HealthPointsService,
        @inject(ActivityService) private activityService: ActivityService
    ) {}

    /**
     * Receives a score from an external LTI tool and converts it to
     * HP points in the Vibe health points system based on actual Reward Value.
     */
    async processScore(payload: LtiScorePayload): Promise<{ hpAwarded: number }> {
        const { userId, courseId, activityId, activityTitle, scoreGiven, scoreMaximum, toolId } = payload;

        if (scoreMaximum <= 0) {
            throw new Error('scoreMaximum must be greater than 0');
        }

        // Fetch configured reward value from database
        let maxHp = 100;
        try {
            if (activityId) {
                const activity = await this.activityService.getActivityById({ _id: userId } as any, activityId);
                if (activity && typeof activity.rewardValue === 'number') {
                    maxHp = activity.rewardValue;
                }
            }
        } catch (err) {
            console.error(`[LtiGradeService] Failed to fetch activity ${activityId} for reward validation`, err);
        }

        // Percentage based off actual HP reward configured by Teacher
        const percentage = scoreGiven / scoreMaximum;
        const hpAwarded = Math.round(percentage * maxHp);

        if (hpAwarded > 0) {
            await this.hpService.addEvent(
                userId,
                courseId,
                'BONUS',
                hpAwarded,
                `LTI Tool score: ${activityTitle} (tool: ${toolId}, score: ${scoreGiven}/${scoreMaximum})`,
                userId  // createdBy = the student themselves (automated)
            );
        }

        console.log(`[LtiGradeService] Awarded ${hpAwarded} HP to user ${userId} in course ${courseId} for LTI activity "${activityTitle}"`);

        return { hpAwarded };
    }
}
