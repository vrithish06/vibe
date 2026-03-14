import cron from 'node-cron';
import { injectable, inject } from 'inversify';
import { ActivityService } from './ActivityService.js';

@injectable()
export class ActivityCronService {
  constructor(
    @inject(ActivityService) private activityService: ActivityService
  ) {}

  public scheduleActivityCron() {
    // Run every hour to check for completed activities past their deadline
    cron.schedule('0 * * * *', async () => {
      console.log('Running automatic activity grading cron job...');
      try {
        await this.activityService.processAutomaticActivityHP();
        console.log('Automatic activity grading cron job completed successfully');
      } catch (error) {
        console.error('Automatic activity grading cron job failed:', error);
      }
    });

    console.log('✅ Automatic activity grading cron job scheduled');
  }
}
