import cron from 'node-cron';
import config from '../../config/config.ts';
import { AutomaticAchievementService } from './AutomaticAchievementService.ts';
import LogService from './LogService.ts';

const KYIV_TIMEZONE = 'Europe/Kyiv';

class AchievementSchedulerService {
    private automaticAchievementService: AutomaticAchievementService = new AutomaticAchievementService();

    init() {
        if (config.env !== 'test') {
            cron.schedule('0 4 * * *', () => {
                this.runNightlySweep();
            }, { timezone: KYIV_TIMEZONE });

            console.log('Achievement scheduler started');
        }
    }

    runNightlySweep(): void {
        try {
            console.log('Running nightly automatic achievement reconciliation sweep...');
            this.automaticAchievementService.recomputeAll();
            console.log('Nightly automatic achievement sweep completed');
        } catch (err: any) {
            LogService.logError('Failed to run nightly automatic achievement sweep:', err);
        }
    }
}

export default new AchievementSchedulerService();
