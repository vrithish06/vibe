import { ActivityController } from './controllers/ActivityController.js';
import { activitiesContainerModule } from './container.js';

export const activitiesModuleControllers = [ActivityController];
export const activitiesModuleValidators = [];
export const activitiesContainerModules = [activitiesContainerModule];

export async function setupActivitiesContainer() {
    const { getContainer } = await import('#root/bootstrap/loadModules.js');
    const container = getContainer();
    container.load(activitiesContainerModule);
}
