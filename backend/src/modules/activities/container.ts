import { ContainerModule } from 'inversify';
import { ActivityController } from './controllers/ActivityController.js';
import { ActivityService } from './services/ActivityService.js';

export const activitiesContainerModule = new ContainerModule(options => {
    options.bind(ActivityController).toSelf().inSingletonScope();
    options.bind(ActivityService).toSelf().inSingletonScope();
});
