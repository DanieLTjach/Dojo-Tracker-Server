import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { ProfileAchievementService } from '../src/service/ProfileAchievementService.ts';
import { createCustomEvent, openEventWindow } from './testHelpers.ts';
import { UserService } from '../src/service/UserService.ts';
import { AUTOMATIC_ACHIEVEMENTS } from '../src/data/automaticAchievementCatalog.ts';
import type { UserAchievementCoverage } from '../src/model/AchievementModels.ts';

const EVENT_4P = 9500;
const EVENT_3P = 9501;
const CLUB_ID = 1;

describe('automatic achievement coverage eligibility', () => {
    const service = new ProfileAchievementService();
    const userService = new UserService();

    let yonmaScoreOnly: number;
    let yonmaTracked: number;
    let sanmaPlayer: number;

    function insertGame(eventId: number, endedAt: string): number {
        const info = dbManager.db.prepare(`
            INSERT INTO game (eventId, createdAt, modifiedAt, modifiedBy, status, startedAt, endedAt, lastRoundWasDeleted)
            VALUES (?, ?, ?, 0, 'FINISHED', ?, ?, 0)
        `).run(eventId, endedAt, endedAt, endedAt, endedAt);
        return Number(info.lastInsertRowid);
    }

    function addPlayer(gameId: number, userId: number, startPlace: string): void {
        dbManager.db.prepare(`
            INSERT INTO userToGame (userId, gameId, startPlace, points, chomboCount, isSubstitutePlayer, createdAt, modifiedAt, modifiedBy)
            VALUES (?, ?, ?, 25000, 0, 0, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z', 0)
        `).run(userId, gameId, startPlace);
    }

    function addRound(gameId: number, winnerId: number): void {
        dbManager.db.prepare(`
            INSERT INTO gameRound (gameId, roundNumber, wind, dealerNumber, counters, riichiSticks, result)
            VALUES (?, 1, 'EAST', 1, 0, 0, ?)
        `).run(
            gameId,
            JSON.stringify({
                type: 'TSUMO',
                winningHandData: { winnerPlayerId: winnerId, yakumanCount: 0, han: 1, fu: 30 },
                riichiPlayerIds: [],
                playerPointChanges: [
                    { playerId: winnerId, pointChange: 3000 },
                    { playerId: -1, pointChange: -1000 },
                ],
            })
        );
    }

    function coverage(userId: number): UserAchievementCoverage {
        return service.getUserProfileAchievementsResponse(userId, 'en').coverage;
    }

    beforeAll(() => {
        yonmaScoreOnly = userService.registerUser('CovScore', 'covscore', 950001, 0).id;
        yonmaTracked = userService.registerUser('CovTracked', 'covtracked', 950002, 0).id;
        sanmaPlayer = userService.registerUser('CovSanma', 'covsanma', 950003, 0).id;

        createCustomEvent(
            EVENT_4P,
            'Coverage 4P',
            openEventWindow().dateFrom,
            openEventWindow().dateTo,
            2,
            CLUB_ID,
            'TOURNAMENT'
        );

        const sanmaRulesId = (dbManager.db.prepare(
            'SELECT id FROM gameRules WHERE name = ? AND numberOfPlayers = 3'
        ).get('Mahjong Soul Sanma') as { id: number }).id;
        createCustomEvent(
            EVENT_3P,
            'Coverage 3P',
            openEventWindow().dateFrom,
            openEventWindow().dateTo,
            sanmaRulesId,
            CLUB_ID,
            'TOURNAMENT'
        );

        // Score-only yonma game: no rounds recorded.
        const g1 = insertGame(EVENT_4P, '2025-07-01T10:00:00.000Z');
        addPlayer(g1, yonmaScoreOnly, 'EAST');
        addPlayer(g1, yonmaTracked, 'SOUTH');

        // Tracked yonma game: rounds recorded.
        const g2 = insertGame(EVENT_4P, '2025-07-02T10:00:00.000Z');
        addPlayer(g2, yonmaTracked, 'EAST');
        addPlayer(g2, sanmaPlayer, 'SOUTH');
        addRound(g2, yonmaTracked);

        // Tracked sanma game.
        const g3 = insertGame(EVENT_3P, '2025-07-03T10:00:00.000Z');
        addPlayer(g3, sanmaPlayer, 'EAST');
        addRound(g3, sanmaPlayer);
    });

    afterAll(() => {
        dbManager.db.prepare(`
            DELETE FROM gameRound WHERE gameId IN (SELECT id FROM game WHERE eventId IN (?, ?))
        `).run(EVENT_4P, EVENT_3P);
        dbManager.db.prepare(`
            DELETE FROM userToGame WHERE gameId IN (SELECT id FROM game WHERE eventId IN (?, ?))
        `).run(EVENT_4P, EVENT_3P);
        dbManager.db.prepare('DELETE FROM game WHERE eventId IN (?, ?)').run(EVENT_4P, EVENT_3P);
        dbManager.db.prepare('DELETE FROM automaticAchievementState WHERE userId IN (?, ?, ?)')
            .run(yonmaScoreOnly, yonmaTracked, sanmaPlayer);
        dbManager.db.prepare('DELETE FROM user WHERE id IN (?, ?, ?)').run(yonmaScoreOnly, yonmaTracked, sanmaPlayer);
        dbManager.db.prepare('DELETE FROM tournament WHERE eventId IN (?, ?)').run(EVENT_4P, EVENT_3P);
        dbManager.db.prepare('DELETE FROM event WHERE id IN (?, ?)').run(EVENT_4P, EVENT_3P);
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    it('excludes sanma-only and trackedOnly codes for a yonma score-only player', () => {
        const cov = coverage(yonmaScoreOnly);
        const expected = AUTOMATIC_ACHIEVEMENTS.filter(def => def.gameSize !== 3 && !def.trackedOnly).length;
        expect(cov.totalCount).toBe(AUTOMATIC_ACHIEVEMENTS.length);
        expect(cov.eligibleCount).toBe(expected);
        expect(cov.eligibleCount).toBeLessThan(cov.totalCount);
        expect(cov.percentage).toBe(Math.round((cov.unlockedCount / expected) * 10000) / 100);
    });

    it('gains the trackedOnly codes once rounds are recorded', () => {
        const cov = coverage(yonmaTracked);
        const expected = AUTOMATIC_ACHIEVEMENTS.filter(def => def.gameSize !== 3).length;
        expect(cov.eligibleCount).toBe(expected);
    });

    it('counts the whole catalog once sanma rounds are played', () => {
        const cov = coverage(sanmaPlayer);
        expect(cov.eligibleCount).toBe(AUTOMATIC_ACHIEVEMENTS.length);
    });
});
