import { getFromContainer } from 'routing-controllers';
import { DeleteCronService } from '#root/modules/courses/services/deleteCronService.js';
import { ActivityCronService } from '#root/modules/activities/services/ActivityCronService.js';
import { initJobs } from '#root/bootstrap/jobs/index.js';

export const startCron = () => {
  try {
    // Get DeleteCronService from the existing container and schedule it
    const deleteCronService = getFromContainer(DeleteCronService);
    initJobs();
    deleteCronService.scheduleDeleteCron();

    console.log('✅ Delete cron job scheduled successfully');

    const activityCronService = getFromContainer(ActivityCronService);
    activityCronService.scheduleActivityCron();
  } catch (error) {
    console.error('❌ Failed to initialize cron services:', error);
  }
};
