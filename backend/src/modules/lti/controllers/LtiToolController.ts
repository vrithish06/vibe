import { injectable, inject } from 'inversify';
import {
    JsonController,
    Get,
    Post,
    Body,
    Authorized,
    CurrentUser,
} from 'routing-controllers';
import { LtiPlatformService, LtiTool } from '../services/LtiPlatformService.js';
import { IUser } from '#shared/interfaces/models.js';

@JsonController('/lti/tools')
@injectable()
export class LtiToolController {
    constructor(
        @inject(LtiPlatformService) private ltiPlatformService: LtiPlatformService
    ) { }

    /**
     * POST /api/lti/tools
     * Teacher/Admin registers a new external LTI tool.
     * Body: { name, launchUrl, clientId, description? }
     */
    @Authorized()
    @Post('/')
    async registerTool(
        @CurrentUser() user: IUser,
        @Body() body: { name: string; launchUrl: string; clientId: string; description?: string }
    ) {
        const tool = this.ltiPlatformService.registerTool({
            name: body.name,
            launchUrl: body.launchUrl,
            clientId: body.clientId,
            description: body.description,
        });

        return { success: true, tool };
    }

    /**
     * GET /api/lti/tools
     * Returns all registered LTI tools (for teacher to pick from when creating activity).
     */
    @Authorized()
    @Get('/')
    async listTools(@CurrentUser() user: IUser) {
        const tools = this.ltiPlatformService.listTools();
        return { tools };
    }
}
