import { injectable, inject } from 'inversify';
import {
    JsonController,
    Get,
    Post,
    Body,
    Authorized,
    CurrentUser,
    Res,
    Req,
} from 'routing-controllers';
import { LtiPlatformService, LtiLaunchPayload } from '../services/LtiPlatformService.js';
import { IUser } from '#shared/interfaces/models.js';
import { appConfig } from '#root/config/app.js';

@JsonController('/lti')
@injectable()
export class LtiPlatformController {
    constructor(
        @inject(LtiPlatformService) private ltiPlatformService: LtiPlatformService
    ) { }

    /**
     * GET /api/lti/jwks
     * Exposes Vibe's public RSA key.
     * The external tool (lTI_System) uses this to validate the JWT Vibe sends.
     */
    @Get('/jwks')
    async getJwks() {
        return this.ltiPlatformService.getJwks();
    }

    /**
     * POST /api/lti/launch/:toolId/:activityId
     * Called by Vibe frontend when a student clicks "Launch Tool".
     * Returns a signed JWT + the tool's launch URL so the frontend can redirect.
     */
    @Authorized()
    @Post('/launch/:toolId/:activityId')
    async launch(
        @CurrentUser() user: IUser,
        @Req() req: any,
        @Body() body: {
            courseId: string;
            courseVersionId: string;
            activityTitle: string;
            role?: 'Learner' | 'Instructor';
        }
    ) {
        const toolId = req.params.toolId;
        const activityId = req.params.activityId;

        let tool = this.ltiPlatformService.getToolById(toolId);
        if (!tool) {
            console.log(`[LTI] Tool ${toolId} not found in memory. Using auto-fallback to http://localhost:5174/`);
            tool = {
                _id: toolId,
                name: 'Auto Discovered Tool',
                launchUrl: 'http://localhost:5174/',
                clientId: 'auto-client',
                createdAt: new Date(),
            };
        }

        const userId = (user as any).userId || user._id?.toString();
        const userEmail = (user as any).email || '';
        const userName = (user as any).name || (user as any).fullName || 'Student';

        const vibeBaseUrl = appConfig.url || `http://localhost:${appConfig.port}`;

        const payload: LtiLaunchPayload = {
            userId,
            userEmail,
            userName,
            courseId: body.courseId,
            courseVersionId: body.courseVersionId,
            activityId,
            activityTitle: body.activityTitle,
            role: body.role || 'Learner',
            toolId,
        };

        const token = await this.ltiPlatformService.generateLaunchToken(payload, vibeBaseUrl);

        return {
            success: true,
            launchUrl: tool.launchUrl,
            token,
        };
    }

    /**
     * POST /api/lti/deep-link-launch/:toolId
     * Called by Vibe frontend when teacher wants to create/select content.
     */
    @Authorized()
    @Post('/deep-link-launch/:toolId')
    async deepLinkLaunch(
        @CurrentUser() user: IUser,
        @Req() req: any,
        @Body() body: { courseId: string; courseVersionId: string; activityTitle?: string; }
    ) {
        const toolId = req.params.toolId;
        let tool = this.ltiPlatformService.getToolById(toolId);
        if (!tool) {
            tool = {
                _id: toolId,
                name: 'Auto Discovered Tool',
                launchUrl: 'http://localhost:5174/',
                clientId: 'auto-client',
                createdAt: new Date(),
            };
        }

        const userId = (user as any).userId || user._id?.toString();
        const userEmail = (user as any).email || '';
        const userName = (user as any).name || (user as any).fullName || 'Instructor';
        const vibeBaseUrl = appConfig.url || `http://localhost:${appConfig.port}`;

        const payload = {
            userId,
            userEmail,
            userName,
            courseId: body.courseId,
            courseVersionId: body.courseVersionId,
            toolId,
            activityTitle: body.activityTitle || ''
        };

        const token = await this.ltiPlatformService.generateDeepLinkingToken(payload, vibeBaseUrl);

        return {
            success: true,
            launchUrl: tool.launchUrl, // the tool should handle routing based on message_type in the token
            token,
        };
    }

    /**
     * POST /api/lti/deep-link-return/:toolId/:courseId/:courseVersionId
     * The LTI Tool POSTs back here with the selected content.
     * In a real implementation, you would decode the JWT sent by the tool,
     * extract the content_items, and inject them into Vibe's ActivityService.
     */
    @Post('/deep-link-return/:toolId/:courseId/:courseVersionId')
    async deepLinkReturn(@Req() req: any, @Res() res: any, @Body() body: any) {
        // This is a placeholder showing where Vibe receives the finalized content from the Tool.
        const JWT = body.JWT; // The signed payload from the tool containing the items
        console.log(`[LTI] Deep link return received for tool ${req.params.toolId}`, body);
        // Extract details (in MVP the JWT is just a raw JSON string or decoded object from the Tool)
        let parsedPayload: any = {};
        if (JWT) {
            try {
                parsedPayload = JSON.parse(JWT);
            } catch (e) {
                parsedPayload = typeof JWT === 'string' ? { raw: JWT } : JWT;
            }
        }

        const items = parsedPayload?.['https://purl.imsglobal.org/spec/lti-dl/claim/content_items'] || [];
        const selectedItem = items[0] || { title: 'LTI Activity' };

        // Support both form POSTs (return HTML script) and AJAX POSTs (return JSON)
        // Since Vibe backend may not have urlencoded parser, we'll return robust JSON for the frontend to handle
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
             return { success: true, item: selectedItem };
        }

        res.setHeader('Content-Type', 'text/html');
        return res.send(`
            <script>
                if (window.opener) {
                    window.opener.postMessage({
                        type: 'LTI_DEEP_LINK_SUCCESS',
                        payload: ${JSON.stringify(selectedItem)}
                    }, '*');
                    window.close();
                } else {
                    alert('Content linked. Please close this window.');
                }
            </script>
        `);
    }
}
