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

        // Never drain inline: enqueueUsers is called from inside a withTransaction
        // handler, so draining here would put the recompute back inside the write
        // transaction this queue exists to escape. setImmediate fires after the
        // synchronous db.transaction()() call returns, i.e. after commit.
        this.scheduleDrain();
    }

    /**
     * Recomputes the given users immediately, bypassing the queue.
     *
     * Only for callers whose own HTTP response reads the recomputed state back —
     * `GameService.addGame` and `TrackedGameService.finishGame` return
     * `achievementUnlocks`, which are read from `automaticAchievementState` by
     * `sourceGameId`, so a deferred drain would return an empty list. The read is
     * scoped to the affected players, so it is cheap; everything else should use
     * `enqueueUsers`.
     */
    recomputeNow(userIds: number[]): void {
        const ids = Array.from(new Set(userIds.filter(id => id > 0)));
        if (ids.length === 0) return;

        // Drop them from any pending batch so the deferred drain does not redo the work.
        for (const id of ids) this.pendingUserIds.delete(id);

        this.automaticAchievementService.recomputeUsers(ids);
    }

    private scheduleDrain(): void {
        // Tests drive the queue explicitly via drainNow(); a scheduled drain would
        // otherwise fire after the test's DB handle is closed.
        if (config.env === 'test') return;
        if (this.isScheduled || this.isDraining) return;

        this.isScheduled = true;
        setImmediate(() => {
            this.isScheduled = false;
            this.drainQueue();
        });
    }

    /** Drains synchronously until empty. Used by tests and by graceful shutdown. */
    drainNow(): void {
        while (this.pendingUserIds.size > 0 && !this.isDraining) {
            this.drainQueue();
        }
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
            // Users enqueued while draining need another pass.
            if (this.pendingUserIds.size > 0) {
                this.scheduleDrain();
            }
        }
    }

    async shutdown(): Promise<void> {
        this.drainNow();
    }
}

export default new AchievementRecomputeQueue();
