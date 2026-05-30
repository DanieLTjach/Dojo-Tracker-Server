import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createCustomEvent } from './testHelpers.ts';
import { UserService } from '../src/service/UserService.ts';
import { AchievementService } from '../src/service/AchievementService.ts';
import type { GameRoundResult } from '../src/model/GameRoundResultModels.ts';

const EVENT_ID = 9100;

function insertFinishedGame(eventId: number): number {
    const ts = '2025-01-01T00:00:00.000Z';
    const info = dbManager.db.prepare(
        `INSERT INTO game (eventId, createdAt, modifiedAt, modifiedBy, status, startedAt, endedAt, lastRoundWasDeleted)
         VALUES (?, ?, ?, 0, 'FINISHED', ?, ?, 0)`
    ).run(eventId, ts, ts, ts, ts);
    return Number(info.lastInsertRowid);
}

function addPlayer(
    gameId: number,
    userId: number,
    startPlace: string,
    points: number,
    chomboCount: number
): void {
    const ts = '2025-01-01T00:00:00.000Z';
    dbManager.db.prepare(
        `INSERT INTO userToGame (userId, gameId, startPlace, points, chomboCount, isSubstitutePlayer, createdAt, modifiedAt, modifiedBy)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, 0)`
    ).run(userId, gameId, startPlace, points, chomboCount, ts, ts);
}

function addRound(gameId: number, roundNumber: number, dealerNumber: number, result: GameRoundResult): void {
    dbManager.db.prepare(
        `INSERT INTO gameRound (gameId, roundNumber, wind, dealerNumber, counters, riichiSticks, result)
         VALUES (?, ?, 'EAST', ?, 0, 0, ?)`
    ).run(gameId, roundNumber, dealerNumber, JSON.stringify(result));
}

function addZeroRatingChange(userId: number, eventId: number, gameId: number): void {
    dbManager.db.prepare(
        `INSERT INTO userRatingChange (userId, eventId, gameId, ratingChange, rating, timestamp)
         VALUES (?, ?, ?, 0, 1500, '2025-01-01T00:00:00.000Z')`
    ).run(userId, eventId, gameId);
}

describe('AchievementService (persisted tournament achievements)', () => {
    const userService = new UserService();
    const achievementService = new AchievementService();

    let u1: number;
    let u2: number;
    let u3: number;
    let u4: number;

    beforeAll(() => {
        u1 = userService.registerUser('Alpha', 'alpha', 910001, 0).id;
        u2 = userService.registerUser('Bravo', 'bravo', 910002, 0).id;
        u3 = userService.registerUser('Charlie', 'charlie', 910003, 0).id;
        u4 = userService.registerUser('Delta', 'delta', 910004, 0).id;

        createCustomEvent(EVENT_ID, 'Achievements Cup', '2024-01-01T00:00:00.000Z', '2026-12-31T23:59:59.999Z', 2, 1, 'TOURNAMENT');

        const gameId = insertFinishedGame(EVENT_ID);
        addPlayer(gameId, u1, 'EAST', 40000, 0);
        addPlayer(gameId, u2, 'SOUTH', 30000, 0);
        addPlayer(gameId, u3, 'WEST', 20000, 0);
        addPlayer(gameId, u4, 'NORTH', 10000, 1);

        const tsumo: GameRoundResult = {
            type: 'TSUMO',
            winningHandData: { winnerPlayerId: u1, yakumanCount: 0, han: 2, fu: 30 },
            riichiPlayerIds: [u1],
            playerPointChanges: [
                { playerId: u1, pointChange: 6000 },
                { playerId: u2, pointChange: -2000 },
                { playerId: u3, pointChange: -2000 },
                { playerId: u4, pointChange: -2000 }
            ],
            nextState: undefined,
            gameFinishReason: undefined
        };
        addRound(gameId, 1, 1, tsumo);
        addZeroRatingChange(u3, EVENT_ID, gameId);
    });

    afterAll(() => {
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    it('computes and returns tournament achievements with winners', () => {
        const results = achievementService.getEventAchievements(EVENT_ID);
        expect(results).toHaveLength(21);

        const dealerWins = results.find((r) => r.metric === 'dealer_wins')!;
        expect(dealerWins.value).toBe(1);
        expect(dealerWins.winners.map((w) => w.userId)).toEqual([u1]);
        expect(dealerWins.criterion).toBe('highest');
        expect(dealerWins.valueFormatted).toBe('1 wins');

        const chombo = results.find((r) => r.metric === 'chombo_count')!;
        expect(chombo.winners.map((w) => w.userId)).toEqual([u4]);

        const saki = results.find((r) => r.metric === 'saki_zero_after_uma_games')!;
        expect(saki.criterion).toBe('all-qualifiers');
        expect(saki.winners.map((w) => w.userId)).toEqual([u3]);

        const yakuman = results.find((r) => r.metric === 'yakuman_wins')!;
        expect(yakuman.winners).toEqual([]);
    });

    it('marks the event computed so a second read does not recompute from scratch', () => {
        achievementService.getEventAchievements(EVENT_ID);
        const computed = dbManager.db
            .prepare('SELECT eventId FROM eventAchievementComputed WHERE eventId = ?')
            .get(EVENT_ID);
        expect(computed).toBeDefined();
    });

    it('returns a user\'s achievements across tournaments for the profile page', () => {
        const achievements = achievementService.getUserAchievements(u1);
        const metrics = achievements.map((a) => a.metric);
        expect(metrics).toContain('dealer_wins');
        expect(metrics).toContain('best_hanchan_points');

        const dealerWins = achievements.find((a) => a.metric === 'dealer_wins')!;
        expect(dealerWins.eventId).toBe(EVENT_ID);
        expect(dealerWins.eventName).toBe('Achievements Cup');
        expect(dealerWins.value).toBe(1);
    });
});
