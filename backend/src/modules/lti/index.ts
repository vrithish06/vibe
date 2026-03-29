import { ltiContainerModule } from './container.js';
import { LtiPlatformController } from './controllers/LtiPlatformController.js';
import { LtiToolController } from './controllers/LtiToolController.js';
import { LtiGradeController } from './controllers/LtiGradeController.js';

export const ltiModuleControllers = [
    LtiPlatformController,
    LtiToolController,
    LtiGradeController,
];

export const ltiModuleValidators: Function[] = [];

export const ltiContainerModules = [ltiContainerModule];

export async function setupLtiContainer() {
    const { getContainer } = await import('#root/bootstrap/loadModules.js');
    const container = getContainer();
    container.load(ltiContainerModule);
}
