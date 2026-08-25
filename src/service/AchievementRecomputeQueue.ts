import config from '../../config/config.ts';
import { AutomaticAchievementService } from './AutomaticAchievementService.ts';
import LogService from './LogService.ts';

export class AchievementRecomputeQueue {
    private pendingUserIds: Set<number> = new Set<number>();
    private isScheduled: boolean = false;
    private isDraining: boolean = false;
    private automaticAchievementService: AutomaticAchievementService = new AutomaticAchievementService();

    enqueueUsers(userIds: number[]): void {
        for (const id of userIds) {
            if (id > 0) {
                this.pendingUserIds.add(id);
            }
        }

        if (this.pendingUserIds.size === 0) return;

        if (config.env === 'test') {
            this.drainQueue();
        } else {
            if (!this.isScheduled && !this.isDraining) {
                this.isScheduled = true;
                setImmediate(() => {
                    this.isScheduled = false;
                    this.drainQueue();
                });
            }
        }
    }

    drainNow(): void {
        this.drainQueue();
    }

    private drainQueue(): void {
        if (this.isDraining || this.pendingUserIds.size === 0) return;

        this.isDraining = true;
        const userIdsToProcess = Array.from(this.pendingUserIds);
        this.pendingUserIds.clear();

        try {
            this.automaticAchievementService.recomputeUsers(userIdsToProcess);
        } catch (err: any) {
            LogService.logError(
                `Failed to drain achievement recompute queue for users [${userIdsToProcess.join(', ')}]:`,
                err
            );
        } finally {
            this.isDraining = false;
            // If more users were enqueued while draining, schedule next drain
            if (this.pendingUserIds.size > 0 && config.env !== 'test' && !this.isScheduled) {
                this.isScheduled = true;
                setImmediate(() => {
                    this.isScheduled = false;
                    this.drainQueue();
                });
            }
        }
    }

    async shutdown(): Promise<void> {
        this.drainNow();
    }
}

export default new AchievementRecomputeQueue();
