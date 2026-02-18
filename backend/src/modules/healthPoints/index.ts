
import { Container, ContainerModule } from 'inversify';
import { healthPointsContainerModule } from './container.js';
import { HealthPointsController } from './controllers/HealthPointsController.js';
import { sharedContainerModule } from '#root/container.js';
import { InversifyAdapter } from '#root/inversify-adapter.js';
import { authorizationChecker, HttpErrorHandler } from '#shared/index.js';
import { useContainer } from 'routing-controllers';
import { authContainerModule } from '../auth/container.js';
import { coursesContainerModule } from '../courses/container.js';

export const healthPointsContainerModules: ContainerModule[] = [
    healthPointsContainerModule,
    sharedContainerModule,
    authContainerModule,
    coursesContainerModule
];

export const healthPointsModuleControllers: Function[] = [
    HealthPointsController
];

export async function setupHealthPointsContainer(): Promise<void> {
    const container = new Container();
    await container.load(...healthPointsContainerModules);
    const inversifyAdapter = new InversifyAdapter(container);
    useContainer(inversifyAdapter);
}

export const healthPointsModuleValidators: Function[] = [];
