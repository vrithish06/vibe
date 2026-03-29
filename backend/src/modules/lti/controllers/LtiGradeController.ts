import { injectable, inject } from 'inversify';
import {
    JsonController,
    Post,
    Param,
    Body,
    Req,
} from 'routing-controllers';
import { LtiGradeService, LtiScorePayload } from '../services/LtiGradeService.js';

/**
 * Assignment and Grade Services (AGS) Controller
 * This is the endpoint that the external lTI_System tool calls after
 * a student completes an activity. It sends a score which we convert to HP.
 *
 * POST /api/lti/ags/:toolId/scores
 * Body (IMS LTI AGS Score schema):
 * {
 *   userId: string,
 *   courseId: string,
 *   activityId: string,
 *   activityTitle: string,
 *   scoreGiven: number,
 *   scoreMaximum: number,
 *   comment?: string
 * }
 */
@JsonController('/lti/ags')
@injectable()
export class LtiGradeController {
    constructor(
        @inject(LtiGradeService) private ltiGradeService: LtiGradeService
    ) { }

    @Post('/:toolId/scores')
    async receiveScore(
        @Param('toolId') toolId: string,
        @Body() body: {
            userId: string;
            courseId: string;
            activityId: string;
            activityTitle: string;
            scoreGiven: number;
            scoreMaximum: number;
            comment?: string;
        },
        @Req() req: any
    ) {
        // Basic secret check — in production use proper JWT validation
        const secret = req.headers['x-lti-secret'];
        if (!secret || secret !== process.env.LTI_SHARED_SECRET) {
            return { error: 'Unauthorized' };
        }

        const payload: LtiScorePayload = {
            userId: body.userId,
            courseId: body.courseId,
            activityId: body.activityId,
            activityTitle: body.activityTitle,
            toolId,
            scoreGiven: body.scoreGiven,
            scoreMaximum: body.scoreMaximum,
            comment: body.comment,
        };

        const result = await this.ltiGradeService.processScore(payload);

        return {
            success: true,
            message: `Score processed. ${result.hpAwarded} HP awarded to user ${body.userId}.`,
            hpAwarded: result.hpAwarded,
        };
    }
}
