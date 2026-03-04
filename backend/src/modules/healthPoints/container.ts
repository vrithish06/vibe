import { ContainerModule } from 'inversify';
import { HealthPointsService } from './services/HealthPointsService.js';
import { HealthPointsController } from './controllers/HealthPointsController.js';
import { StudentHealthPointsController } from './controllers/StudentHealthPointsController.js';

export const healthPointsContainerModule = new ContainerModule((options) => {
    options.bind(HealthPointsService).toSelf().inSingletonScope();
    options.bind(HealthPointsController).toSelf().inSingletonScope();
    options.bind(StudentHealthPointsController).toSelf().inSingletonScope();
});
