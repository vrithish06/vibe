import { ContainerModule } from 'inversify';
import { LtiPlatformService } from './services/LtiPlatformService.js';
import { LtiGradeService } from './services/LtiGradeService.js';
import { LtiPlatformController } from './controllers/LtiPlatformController.js';
import { LtiToolController } from './controllers/LtiToolController.js';
import { LtiGradeController } from './controllers/LtiGradeController.js';

export const ltiContainerModule = new ContainerModule(options => {
    options.bind(LtiPlatformService).toSelf().inSingletonScope();
    options.bind(LtiGradeService).toSelf().inSingletonScope();
    options.bind(LtiPlatformController).toSelf().inSingletonScope();
    options.bind(LtiToolController).toSelf().inSingletonScope();
    options.bind(LtiGradeController).toSelf().inSingletonScope();
});
