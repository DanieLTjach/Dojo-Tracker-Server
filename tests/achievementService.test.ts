import { dbManager } from '../src/db/dbInit.ts';
import { createCustomEvent, dateInsideEventWindow, openEventWindow, resetTestDatabase } from './testHelpers.ts';
import { UserService } from '../src/service/UserService.ts';
import { ProfileService } from '../src/service/ProfileService.ts';
import { AchievementService } from '../src/service/AchievementService.ts';
import { EventService } from '../src/service/EventService.ts';
import { GameService } from '../src/service/GameService.ts';
import { AchievementCriterion } from '../src/model/AchievementModels.ts';
import { AchievementsOnlyForTournamentsError } from '../src/error/EventErrors.ts';
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

function addRatingChange(userId: number, eventId: number, gameId: number, ratingChange: number): void {
    dbManager.db.prepare(
        `INSERT INTO userRatingChange (userId, eventId, gameId, ratingChange, rating, timestamp)
         VALUES (?, ?, ?, ?, 1500, '2025-01-01T00:00:00.000Z')`
    ).run(userId, eventId, gameId, ratingChange);
}

describe('AchievementService (persisted tournament achievements)', () => {
    const userService = new UserService();
    const profileService = new ProfileService();
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

        // The requesting user's locale drives result formatting; pin u1 to English
        // so the formatted-value assertions below stay stable.
        profileService.updateProfile(u1, undefined, undefined, undefined, undefined, undefined, undefined, u1, 'en');

        createCustomEvent(
            EVENT_ID,
            'Achievements Cup',
            openEventWindow().dateFrom,
            openEventWindow().dateTo,
            2,
            1,
            'TOURNAMENT'
        );
        dbManager.db.prepare("UPDATE tournament SET status = 'FINISHED' WHERE eventId = ?").run(EVENT_ID);

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
                { playerId: u4, pointChange: -2000 },
            ],
            nextState: undefined,
            gameFinishReason: undefined,
        };
        addRound(gameId, 1, 1, tsumo);
        addRatingChange(u1, EVENT_ID, gameId, 10);
        addRatingChange(u2, EVENT_ID, gameId, 10);
        addRatingChange(u3, EVENT_ID, gameId, 0);
        addRatingChange(u4, EVENT_ID, gameId, 10);

        achievementService.recomputeEventAchievements(new EventService().getEventById(EVENT_ID));
    });

    afterAll(() => {
        resetTestDatabase();
    });

    it('returns stored tournament achievements with winners', () => {
        const results = achievementService.getEventAchievements(EVENT_ID, u1);
        expect(results).toHaveLength(21);

        const dealerWins = results.find(r => r.metric === 'dealer_wins')!;
        expect(dealerWins.value).toBe(1);
        expect(dealerWins.winners.map(w => w.userId)).toEqual([u1]);
        expect(dealerWins.criterion).toBe(AchievementCriterion.Highest);
        expect(dealerWins.valueFormatted).toBe('1 wins');

        const chombo = results.find(r => r.metric === 'chombo_count')!;
        expect(chombo.winners.map(w => w.userId)).toEqual([u4]);

        const saki = results.find(r => r.metric === 'saki_zero_after_uma_games')!;
        expect(saki.criterion).toBe(AchievementCriterion.AllQualifiers);
        expect(saki.winners.map(w => w.userId)).toEqual([u3]);
        expect(saki.value).toBeUndefined();
        expect(saki.valueFormatted).toBeUndefined();

        const yakuman = results.find(r => r.metric === 'yakuman_wins')!;
        expect(yakuman.winners).toEqual([]);
        expect(yakuman.value).toBeUndefined();
    });

    it('does not recompute achievements when retrieving an event', () => {
        dbManager.db
            .prepare('UPDATE event SET achievementsComputedAt = ? WHERE id = ?')
            .run('2000-01-01T00:00:00.000Z', EVENT_ID);

        achievementService.getEventAchievements(EVENT_ID, u1);
        const computed = dbManager.db
            .prepare('SELECT achievementsComputedAt FROM event WHERE id = ?')
            .get(EVENT_ID) as { achievementsComputedAt: string | null };
        expect(computed.achievementsComputedAt).toBe('2000-01-01T00:00:00.000Z');
    });

    it('does not compute missing achievements when retrieving a finished event', () => {
        const unfinishedEventId = 9102;
        createCustomEvent(
            unfinishedEventId,
            'Unfinished Achievements Cup',
            openEventWindow().dateFrom,
            openEventWindow().dateTo,
            2,
            1,
            'TOURNAMENT'
        );
        dbManager.db.prepare("UPDATE tournament SET status = 'FINISHED' WHERE eventId = ?").run(unfinishedEventId);

        const results = achievementService.getEventAchievements(unfinishedEventId, u1);
        const computed = dbManager.db
            .prepare('SELECT achievementsComputedAt FROM event WHERE id = ?')
            .get(unfinishedEventId) as { achievementsComputedAt: string | null };

        expect(results).toEqual([]);
        expect(computed.achievementsComputedAt).toBeNull();
    });

    it('does not compute missing achievements when retrieving a user', () => {
        const unfinishedEventId = 9103;
        createCustomEvent(
            unfinishedEventId,
            'Unfinished User Achievements Cup',
            openEventWindow().dateFrom,
            openEventWindow().dateTo,
            2,
            1,
            'TOURNAMENT'
        );
        dbManager.db.prepare("UPDATE tournament SET status = 'FINISHED' WHERE eventId = ?").run(unfinishedEventId);
        const gameId = insertFinishedGame(unfinishedEventId);
        addPlayer(gameId, u1, 'EAST', 40000, 0);

        achievementService.getUserAchievements(u1, u1);
        const computed = dbManager.db
            .prepare('SELECT achievementsComputedAt FROM event WHERE id = ?')
            .get(unfinishedEventId) as { achievementsComputedAt: string | null };

        expect(computed.achievementsComputedAt).toBeNull();
    });

    it('does not conditionally recompute achievements that have never been computed', () => {
        const eventId = 9104;
        createCustomEvent(
            eventId,
            'Never Computed Cup',
            openEventWindow().dateFrom,
            openEventWindow().dateTo,
            2,
            1,
            'TOURNAMENT'
        );
        dbManager.db.prepare("UPDATE tournament SET status = 'FINISHED' WHERE eventId = ?").run(eventId);

        achievementService.recomputeEventAchievementsIfAlreadyComputed(new EventService().getEventById(eventId));

        const computed = dbManager.db
            .prepare('SELECT achievementsComputedAt FROM event WHERE id = ?')
            .get(eventId) as { achievementsComputedAt: string | null };
        expect(computed.achievementsComputedAt).toBeNull();
    });

    it('conditionally recomputes achievements once they have been computed before', () => {
        const eventId = 9105;
        createCustomEvent(
            eventId,
            'Previously Computed Cup',
            openEventWindow().dateFrom,
            openEventWindow().dateTo,
            2,
            1,
            'TOURNAMENT'
        );
        dbManager.db
            .prepare('UPDATE event SET achievementsComputedAt = ? WHERE id = ?')
            .run('2000-01-01T00:00:00.000Z', eventId);
        const gameId = insertFinishedGame(eventId);
        addPlayer(gameId, u1, 'EAST', 40000, 0);

        achievementService.recomputeEventAchievementsIfAlreadyComputed(new EventService().getEventById(eventId));

        const computed = dbManager.db
            .prepare('SELECT achievementsComputedAt FROM event WHERE id = ?')
            .get(eventId) as { achievementsComputedAt: string | null };
        const storedAchievements = dbManager.db
            .prepare('SELECT COUNT(*) AS count FROM eventAchievement WHERE eventId = ?')
            .get(eventId) as { count: number };
        expect(computed.achievementsComputedAt).not.toBe('2000-01-01T00:00:00.000Z');
        expect(storedAchievements.count).toBeGreaterThan(0);
    });

    it('recomputes initialized achievements when a finished game is created', () => {
        const eventId = 9106;
        createCustomEvent(
            eventId,
            'New Finished Game Cup',
            openEventWindow().dateFrom,
            openEventWindow().dateTo,
            2,
            1,
            'TOURNAMENT'
        );
        dbManager.db
            .prepare('UPDATE event SET achievementsComputedAt = ? WHERE id = ?')
            .run('2000-01-01T00:00:00.000Z', eventId);

        new GameService().addGame(
            eventId,
            [
                { userId: u1, points: 50000, startPlace: 'EAST' },
                { userId: u2, points: 30000, startPlace: 'SOUTH' },
                { userId: u3, points: 20000, startPlace: 'WEST' },
                { userId: u4, points: 20000, startPlace: 'NORTH' },
            ],
            0,
            new Date(dateInsideEventWindow(30)),
            true,
            null,
            null
        );

        const bestGamePoints = dbManager.db
            .prepare(
                `SELECT userId, value
                 FROM eventAchievement
                 WHERE eventId = ? AND metric = 'best_game_points'`
            )
            .get(eventId) as { userId: number, value: number } | undefined;
        expect(bestGamePoints).toEqual({ userId: u1, value: 50000 });
    });

    it('force recompute returns results and refreshes the computed marker', () => {
        const results = achievementService.forceRecomputeEventAchievements(EVENT_ID, u1);
        const dealerWins = results.find(r => r.metric === 'dealer_wins')!;
        expect(dealerWins.winners.map(w => w.userId)).toEqual([u1]);
    });

    it('force recompute rejects non-tournament events', () => {
        const seasonEventId = 9101;
        createCustomEvent(
            seasonEventId,
            'Achievements Season',
            openEventWindow().dateFrom,
            openEventWindow().dateTo,
            2,
            1,
            'SEASON'
        );
        expect(() => achievementService.forceRecomputeEventAchievements(seasonEventId, u1))
            .toThrow(AchievementsOnlyForTournamentsError);
    });

    it("formats a user's achievements in the requesting user's locale", () => {
        const achievements = achievementService.getUserAchievements(u1, u2);
        const metrics = achievements.map(a => a.metric);
        expect(metrics).toContain('dealer_wins');
        expect(metrics).toContain('best_game_points');

        const dealerWins = achievements.find(a => a.metric === 'dealer_wins')!;
        expect(dealerWins.eventId).toBe(EVENT_ID);
        expect(dealerWins.eventName).toBe('Achievements Cup');
        expect(dealerWins.value).toBe(1);
        expect(dealerWins.description).toBe('Найбільше перемог на дилері');
        expect(dealerWins.valueFormatted).toBe('1 перемог');
    });
});
