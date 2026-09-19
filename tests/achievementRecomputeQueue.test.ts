import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { TrackedGameService } from '../src/service/TrackedGameService.ts';
import AchievementRecomputeQueue from '../src/service/AchievementRecomputeQueue.ts';
import { AutomaticAchievementRepository } from '../src/repository/AutomaticAchievementRepository.ts';
import { AutomaticAchievementService } from '../src/service/AutomaticAchievementService.ts';
import { GameStatus, Wind } from '../src/model/GameModels.ts';

const SYSTEM_USER_ID = 0;

describe('AchievementRecomputeQueue', () => {
    const achievementRepository = new AutomaticAchievementRepository();
    const automaticAchievementService = new AutomaticAchievementService();
    const trackedGameService = new TrackedGameService();

    let userId: number;

    beforeAll(() => {
        const res = dbManager.db.prepare(`
            INSERT INTO user (name, telegramUsername, telegramId, createdAt, modifiedAt, modifiedBy, isActive, isAdmin, status)
            VALUES ('QueueUser', 'queueuser', 99887811, datetime('now'), datetime('now'), 0, 1, 0, 'ACTIVE')
            RETURNING id
        `).get() as { id: number };
        userId = res.id;

        dbManager.db.prepare(`
            INSERT INTO user (id, name, telegramUsername, telegramId, createdAt, modifiedAt, modifiedBy, isActive, isAdmin, status)
            VALUES (202, 'Q2', 'q2', 99887812, datetime('now'), datetime('now'), 0, 1, 0, 'ACTIVE'),
                   (203, 'Q3', 'q3', 99887813, datetime('now'), datetime('now'), 0, 1, 0, 'ACTIVE'),
                   (204, 'Q4', 'q4', 99887814, datetime('now'), datetime('now'), 0, 1, 0, 'ACTIVE')
        `).run();

        // A finished game gives the evaluator something real to produce states from.
        const players = [
            { userId, startPlace: Wind.EAST },
            { userId: 202, startPlace: Wind.SOUTH },
            { userId: 203, startPlace: Wind.WEST },
            { userId: 204, startPlace: Wind.NORTH },
        ];
        const game = trackedGameService.createTrackedGame(1, players, SYSTEM_USER_ID, GameStatus.IN_PROGRESS);
        trackedGameService.setEnterHandDetail(game.id, false, SYSTEM_USER_ID);
        trackedGameService.addGameRoundResult(game.id, 1, {
            type: 'TSUMO',
            winningHandData: { winnerPlayerId: userId, han: 1, fu: 30, yakumanCount: 0 },
            riichiPlayerIds: [userId],
        }, SYSTEM_USER_ID);
        trackedGameService.finishGame(game.id, SYSTEM_USER_ID);
    });

    afterAll(() => {
        const ids = `${userId}, 202, 203, 204`;
        dbManager.db.prepare(`DELETE FROM automaticAchievementState WHERE userId IN (${ids})`).run();
        dbManager.db.prepare(`DELETE FROM userRatingChange WHERE userId IN (${ids})`).run();
        dbManager.db.prepare(`DELETE FROM skillRatingGame WHERE userId IN (${ids})`).run();
        const gameIds = (dbManager.db.prepare('SELECT gameId FROM userToGame WHERE userId = ?').all(userId) as any[])
            .map(r => r.gameId);
        dbManager.db.prepare(
            `DELETE FROM gameRound WHERE gameId IN (SELECT gameId FROM userToGame WHERE userId = ${userId})`
        ).run();
        dbManager.db.prepare(`DELETE FROM userToGame WHERE userId IN (${ids})`).run();
        if (gameIds.length > 0) {
            dbManager.db.prepare(`DELETE FROM game WHERE id IN (${gameIds.join(',')})`).run();
        }
        dbManager.db.prepare(`DELETE FROM user WHERE id IN (${ids})`).run();
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    it('defers work instead of draining inline', () => {
        // enqueueUsers must never recompute synchronously: it is called from inside a
        // withTransaction handler, and draining there would put the recompute back
        // inside the write transaction the queue exists to escape.
        achievementRepository.deleteStatesForUser(userId);

        AchievementRecomputeQueue.enqueueUsers([userId]);

        expect(achievementRepository.findStatesByUserId(userId)).toHaveLength(0);
    });

    it('produces the same states as a direct recompute once drained', () => {
        achievementRepository.deleteStatesForUser(userId);

        AchievementRecomputeQueue.enqueueUsers([userId]);
        AchievementRecomputeQueue.drainNow();
        const fromQueue = achievementRepository.findStatesByUserId(userId);

        automaticAchievementService.recomputeUsers([userId]);
        const fromDirect = achievementRepository.findStatesByUserId(userId);

        // The game above must actually unlock something, or this asserts nothing.
        expect(fromQueue.length).toBeGreaterThan(0);
        expect(fromQueue.map(s => s.code).sort()).toEqual(fromDirect.map(s => s.code).sort());
    });

    it('coalesces repeated enqueues of the same user into one pending entry', () => {
        achievementRepository.deleteStatesForUser(userId);

        AchievementRecomputeQueue.enqueueUsers([userId]);
        AchievementRecomputeQueue.enqueueUsers([userId]);
        AchievementRecomputeQueue.enqueueUsers([userId]);
        AchievementRecomputeQueue.drainNow();

        expect(achievementRepository.findStatesByUserId(userId).length).toBeGreaterThan(0);
        // Draining an empty queue is a no-op rather than an error.
        expect(() => AchievementRecomputeQueue.drainNow()).not.toThrow();
    });

    it('ignores the system user and non-positive ids', () => {
        AchievementRecomputeQueue.enqueueUsers([0, -1]);
        expect(() => AchievementRecomputeQueue.drainNow()).not.toThrow();
        expect(achievementRepository.findStatesByUserId(0)).toHaveLength(0);
    });
});
