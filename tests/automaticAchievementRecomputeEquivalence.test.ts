import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { AutomaticAchievementService } from '../src/service/AutomaticAchievementService.ts';
import { createCustomEvent, openEventWindow } from './testHelpers.ts';
import { UserService } from '../src/service/UserService.ts';

const EVENT_ID = 9400;
const CLUB_ID = 1;

// Skill rows carry mu/sigma; display rating is mu - 3*sigma. Sigma is pinned so
// the display ratings below read directly: 1515-15 = 1500, etc.
const SIGMA = 5;

describe('per-user recompute matches a full recompute for skill tracks', () => {
    const service = new AutomaticAchievementService();
    const userService = new UserService();

    let subjectId: number;
    let rivalId: number;
    let thirdId: number;
    const gameIds: number[] = [];

    function insertFinishedGame(endedAt: string): number {
        const info = dbManager.db.prepare(`
            INSERT INTO game (eventId, createdAt, modifiedAt, modifiedBy, status, startedAt, endedAt, lastRoundWasDeleted)
            VALUES (?, ?, ?, 0, 'FINISHED', ?, ?, 0)
        `).run(EVENT_ID, endedAt, endedAt, endedAt, endedAt);
        return Number(info.lastInsertRowid);
    }

    function addPlayer(gameId: number, userId: number, startPlace: string, points: number): void {
        dbManager.db.prepare(`
            INSERT INTO userToGame (userId, gameId, startPlace, points, chomboCount, isSubstitutePlayer, createdAt, modifiedAt, modifiedBy)
            VALUES (?, ?, ?, ?, 0, 0, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z', 0)
        `).run(userId, gameId, startPlace, points);
    }

    function insertSkillRow(
        gameId: number,
        userId: number,
        rank: number,
        muBefore: number,
        muAfter: number,
        playedAt: string
    ): void {
        dbManager.db.prepare(`
            INSERT INTO skillRatingGame (gameId, userId, clubId, gameSize, rank, muBefore, sigmaBefore, muAfter, sigmaAfter, playedAt)
            VALUES (?, ?, ?, 4, ?, ?, ?, ?, ?, ?)
        `).run(gameId, userId, CLUB_ID, rank, muBefore, SIGMA, muAfter, SIGMA, playedAt);
    }

    function readPersisted(): Array<{ code: string, scope: string, progress: number, value: number | null }> {
        return dbManager.db.prepare(`
            SELECT userId, code, scope, progress, target, unlockedAt, value
            FROM automaticAchievementState WHERE userId = ?
        `).all(subjectId) as never;
    }

    beforeAll(() => {
        subjectId = userService.registerUser('Ratee', 'ratee', 940001, 0).id;
        rivalId = userService.registerUser('Rival', 'rival', 940002, 0).id;
        thirdId = userService.registerUser('Third', 'third', 940003, 0).id;

        createCustomEvent(
            EVENT_ID,
            'Skill Replay Cup',
            openEventWindow().dateFrom,
            openEventWindow().dateTo,
            2,
            CLUB_ID,
            'TOURNAMENT'
        );

        // Game 1: the subject takes the track lead.
        const g1 = insertFinishedGame('2025-06-01T10:00:00.000Z');
        gameIds.push(g1);
        addPlayer(g1, subjectId, 'EAST', 40000);
        addPlayer(g1, rivalId, 'SOUTH', 30000);
        addPlayer(g1, thirdId, 'WEST', 20000);
        insertSkillRow(g1, subjectId, 1, 1515, 1615, '2025-06-01T10:00:00.000Z');
        insertSkillRow(g1, rivalId, 2, 1615, 1565, '2025-06-01T10:00:00.000Z');
        insertSkillRow(g1, thirdId, 3, 1565, 1515, '2025-06-01T10:00:00.000Z');

        // Game 2: a game the subject did NOT play in - the rival overtakes them
        // and becomes the sole track leader.
        const g2 = insertFinishedGame('2025-06-02T10:00:00.000Z');
        gameIds.push(g2);
        addPlayer(g2, rivalId, 'EAST', 40000);
        addPlayer(g2, thirdId, 'SOUTH', 20000);
        insertSkillRow(g2, rivalId, 1, 1565, 1715, '2025-06-02T10:00:00.000Z');
        insertSkillRow(g2, thirdId, 2, 1515, 1505, '2025-06-02T10:00:00.000Z');

        // Game 3: the subject wins at the table while NOT holding the lead.
        const g3 = insertFinishedGame('2025-06-03T10:00:00.000Z');
        gameIds.push(g3);
        addPlayer(g3, subjectId, 'EAST', 40000);
        addPlayer(g3, rivalId, 'SOUTH', 30000);
        addPlayer(g3, thirdId, 'WEST', 20000);
        insertSkillRow(g3, subjectId, 1, 1615, 1625, '2025-06-03T10:00:00.000Z');
        insertSkillRow(g3, rivalId, 2, 1715, 1705, '2025-06-03T10:00:00.000Z');
        insertSkillRow(g3, thirdId, 3, 1505, 1495, '2025-06-03T10:00:00.000Z');
    });

    afterAll(() => {
        dbManager.db.prepare(`DELETE FROM skillRatingGame WHERE gameId IN (${gameIds.map(() => '?').join(',')})`).run(
            ...gameIds
        );
        dbManager.db.prepare(`DELETE FROM userToGame WHERE gameId IN (${gameIds.map(() => '?').join(',')})`).run(
            ...gameIds
        );
        dbManager.db.prepare(`DELETE FROM game WHERE id IN (${gameIds.map(() => '?').join(',')})`).run(...gameIds);
        dbManager.db.prepare('DELETE FROM automaticAchievementState WHERE userId IN (?, ?, ?)').run(
            subjectId,
            rivalId,
            thirdId
        );
        dbManager.db.prepare('DELETE FROM user WHERE id IN (?, ?, ?)').run(subjectId, rivalId, thirdId);
        dbManager.db.prepare('DELETE FROM tournament WHERE eventId = ?').run(EVENT_ID);
        dbManager.db.prepare('DELETE FROM event WHERE id = ?').run(EVENT_ID);
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    it('counts no lead defence for a win from second place on the leaderboard', () => {
        service.recomputeUser(subjectId);
        const defend = readPersisted().find(s => s.code === 'OPENSKILL_RANK1_DEFEND_3');
        expect(defend).toBeUndefined();
    });

    it('reaches the same states as the full recompute', () => {
        service.recomputeUser(subjectId);
        const afterPartial = readPersisted();
        service.recomputeAll();
        const afterFull = readPersisted();

        expect(afterPartial.map(s => [s.code, s.scope, s.progress, s.value])).toEqual(
            afterFull.map(s => [s.code, s.scope, s.progress, s.value])
        );
    });
});
