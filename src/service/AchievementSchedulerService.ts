import cron from 'node-cron';
import config from '../../config/config.ts';
import { AutomaticAchievementService } from './AutomaticAchievementService.ts';
import LogService from './LogService.ts';

const KYIV_TIMEZONE = 'Europe/Kyiv';

class AchievementSchedulerService {
    private automaticAchievementService: AutomaticAchievementService = new AutomaticAchievementService();

    init() {
        if (config.env !== 'test') {
            cron.schedule('0 * * * *', () => {
                this.runSweep();
            }, { timezone: KYIV_TIMEZONE });

            console.log('Achievement scheduler started');
        }
    }

    /**
     * Reconciliation sweep: the event-driven recompute in
     * `AchievementRecomputeQueue` is what normally keeps achievements current,
     * and this catches whatever it missed.
     *
     * Hourly rather than nightly because it is cheap - a full `recomputeAll`
     * measures ~250ms against production data (291 users / 2069 games), so the
     * staleness window is worth far more than the cost. It does run
     * synchronously on the main thread, so revisit the frequency (or move it
     * off-thread) if that figure grows into the seconds.
     */
    runSweep(): void {
        try {
            console.log('Running automatic achievement reconciliation sweep...');
            this.automaticAchievementService.recomputeAll();
            console.log('Automatic achievement sweep completed');
        } catch (err: any) {
            LogService.logError('Failed to run automatic achievement sweep:', err);
        }
    }
}

export default new AchievementSchedulerService();
