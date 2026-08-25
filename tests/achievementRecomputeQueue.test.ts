import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { dbManager } from '../src/db/dbInit.ts';
import AchievementRecomputeQueue from '../src/service/AchievementRecomputeQueue.ts';
import { AutomaticAchievementRepository } from '../src/repository/AutomaticAchievementRepository.ts';
import { AutomaticAchievementService } from '../src/service/AutomaticAchievementService.ts';

describe('AchievementRecomputeQueue', () => {
    const achievementRepository = new AutomaticAchievementRepository();
    const automaticAchievementService = new AutomaticAchievementService();

    beforeAll(() => {
        dbManager.db.prepare(`
            INSERT INTO user (id, name, telegramUsername, telegramId, createdAt, modifiedAt, modifiedBy, isActive, isAdmin, status)
            VALUES (999, 'QueueTestUser', 'queuetest', 999123, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 0, 1, 0, 'ACTIVE')
        `).run();
    });

    afterAll(() => {
        dbManager.db.prepare('DELETE FROM automaticAchievementState WHERE userId = 999').run();
        dbManager.db.prepare('DELETE FROM user WHERE id = 999').run();
    });

    test('enqueueUsers and drainNow matches direct recomputeUsers result', () => {
        // Enqueue and drain
        AchievementRecomputeQueue.enqueueUsers([999]);
        AchievementRecomputeQueue.drainNow();

        const statesFromQueue = achievementRepository.findStatesByUserId(999);

        // Run direct recomputeUsers
        automaticAchievementService.recomputeUsers([999]);
        const statesFromDirect = achievementRepository.findStatesByUserId(999);

        expect(statesFromQueue).toEqual(statesFromDirect);
    });
});
