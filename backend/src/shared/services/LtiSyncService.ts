import { injectable } from 'inversify';

/**
 * LtiSyncService — Server-to-server bridge from VIBE backend → LTI backend.
 *
 * Principles:
 *  • VIBE remains the UI / trigger layer.
 *  • LTI is the source of truth for activities, submissions, and Brownie Points.
 *  • All calls are authenticated with a shared secret header so external
 *    clients cannot write data into the LTI system.
 *
 * All methods are "best-effort" and non-fatal: if the LTI backend is
 * unavailable, the VIBE operation still succeeds and the error is logged.
 */
@injectable()
export class LtiSyncService {
    private readonly baseUrl: string;
    private readonly sharedSecret: string;

    constructor() {
        this.baseUrl = process.env.LTI_BACKEND_URL || 'http://localhost:4000/api';
        this.sharedSecret = process.env.LTI_SHARED_SECRET || '';
    }

    private get authHeaders(): Record<string, string> {
        return {
            'Content-Type': 'application/json',
            'x-lti-secret': this.sharedSecret,
        };
    }

    /**
     * Mirror an activity into the LTI database.
     * Called whenever VIBE creates or updates an activity.
     *
     * @param params Activity data to sync
     */
    async syncActivity(params: {
        activity_id: string;
        course_id: string;
        title: string;
        type: 'ASSIGNMENT' | 'VIBE_MILESTONE' | 'LTI_TOOL';
        deadline?: Date | null;
        grace_period?: number;
        reward_hp?: number;
        late_penalty_hp?: number;
        late_penalty_percent?: number;
        overdue_penalty_hp?: number;
        overdue_penalty_percent?: number;
        is_mandatory?: boolean;
    }): Promise<void> {
        const {
            activity_id,
            course_id,
            title,
            type,
            deadline,
            grace_period,
            reward_hp,
            late_penalty_hp,
            late_penalty_percent,
            overdue_penalty_hp,
            overdue_penalty_percent,
            is_mandatory,
        } = params;

        const rules: Record<string, number> = {};
        if (reward_hp != null) rules.reward_hp = reward_hp;
        if (late_penalty_hp != null) rules.late_penalty_hp = late_penalty_hp;
        if (late_penalty_percent != null) rules.late_penalty_percent = late_penalty_percent;
        if (overdue_penalty_hp != null) rules.overdue_penalty_hp = overdue_penalty_hp;
        if (overdue_penalty_percent != null) rules.overdue_penalty_percent = overdue_penalty_percent;

        try {
            const res = await fetch(`${this.baseUrl}/activities`, {
                method: 'POST',
                headers: this.authHeaders,
                body: JSON.stringify({
                    activity_id,
                    course_id,
                    title,
                    type,
                    deadline: deadline ? deadline.toISOString() : null,
                    grace_period: grace_period ?? 0,
                    rules,
                    is_mandatory: is_mandatory !== false,
                }),
            });

            if (!res.ok) {
                const detail = await res.text();
                console.warn(`[LtiSyncService] syncActivity failed (${res.status}): ${detail}`);
            } else {
                console.log(`[LtiSyncService] Activity "${title}" synced to LTI (id: ${activity_id})`);
            }
        } catch (err: any) {
            console.error(`[LtiSyncService] syncActivity network error:`, err?.message || err);
        }
    }

    /**
     * Submit a student's activity through the LTI backend.
     * This triggers automatic Brownie Points award / penalty logic in LTI.
     *
     * @returns Submission result with hp_change, or null if the call failed
     */
    async submitActivity(params: {
        activity_id: string;
        user_id: string;
        course_id: string;
        score?: number;
        score_max?: number;
    }): Promise<{ hp_change: number; status: string; message: string } | null> {
        const { activity_id, user_id, course_id, score, score_max } = params;
        try {
            const res = await fetch(`${this.baseUrl}/activities/${activity_id}/submit`, {
                method: 'POST',
                headers: this.authHeaders,
                body: JSON.stringify({ user_id, course_id, score, score_max }),
            });

            if (!res.ok) {
                const detail = await res.text();
                console.warn(`[LtiSyncService] submitActivity failed (${res.status}): ${detail}`);
                return null;
            }

            const json = await res.json() as { data?: { hp_change: number; status: string; message: string } };
            return (json as any).data ?? null;
        } catch (err: any) {
            console.error(`[LtiSyncService] submitActivity network error:`, err?.message || err);
            return null;
        }
    }

    /**
     * Fetch the current Brownie Points balance for a student in a course from LTI.
     * Used by VIBE when the course has `useExternalBP = true`.
     *
     * @returns { current_hp, updated_at } or null if not found / error
     */
    async getBrowniePoints(
        studentId: string,
        courseId: string,
    ): Promise<{ current_hp: number; updated_at: string } | null> {
        try {
            const res = await fetch(
                `${this.baseUrl}/bp/student/${studentId}/${courseId}`,
                { headers: this.authHeaders },
            );

            if (!res.ok) {
                if (res.status === 404) return null;
                const detail = await res.text();
                console.warn(`[LtiSyncService] getBrowniePoints failed (${res.status}): ${detail}`);
                return null;
            }

            const json = await res.json() as { data?: { current_hp: number; updated_at: string } };
            return (json as any).data ?? null;
        } catch (err: any) {
            console.error(`[LtiSyncService] getBrowniePoints network error:`, err?.message || err);
            return null;
        }
    }
}
