import { ContainerModule } from 'inversify';
import { ActivityController } from './controllers/ActivityController.js';
import { ActivityService } from './services/ActivityService.js';
import { CloudStorageService } from './services/CloudStorageService.js';

export const activitiesContainerModule = new ContainerModule(options => {
    options.bind(ActivityController).toSelf().inSingletonScope();
    options.bind(ActivityService).toSelf().inSingletonScope();
    options.bind(CloudStorageService).toSelf().inSingletonScope();
});
