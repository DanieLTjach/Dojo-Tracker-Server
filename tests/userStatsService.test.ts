import { dbManager } from '../src/db/dbInit.ts';
import { createCustomEvent, resetTestDatabase } from './testHelpers.ts';
import { UserStatsService } from '../src/service/UserStatsService.ts';
import { UserService } from '../src/service/UserService.ts';
import { RATING_TO_POINTS_COEFFICIENT } from '../src/model/RatingModels.ts';

const EVENT_ID = 9300;
const OTHER_EVENT_ID = 9301;
const TS = '2025-01-01T00:00:00.000Z';

// `game` is unique on (eventId, createdAt), so each game in an event needs its
// own timestamp. The order also decides the order stats come back in.
let gameSequence = 0;
function insertFinishedGame(eventId: number): number {
    gameSequence += 1;
    const ts = `2025-01-01T00:00:${String(gameSequence).padStart(2, '0')}.000Z`;
    const info = dbManager.db.prepare(
        `INSERT INTO game (eventId, createdAt, modifiedAt, modifiedBy, status, startedAt, endedAt, lastRoundWasDeleted)
         VALUES (?, ?, ?, 0, 'FINISHED', ?, ?, 0)`
    ).run(eventId, ts, ts, ts, ts);
    return Number(info.lastInsertRowid);
}

function addPlayer(gameId: number, userId: number, startPlace: string, points: number): void {
    dbManager.db.prepare(
        `INSERT INTO userToGame (userId, gameId, startPlace, points, chomboCount, isSubstitutePlayer, createdAt, modifiedAt, modifiedBy)
         VALUES (?, ?, ?, ?, 0, 0, ?, ?, 0)`
    ).run(userId, gameId, startPlace, points, TS, TS);
}

function addRatingChange(
    userId: number,
    eventId: number,
    gameId: number,
    ratingChange: number,
    rating: number
): void {
    dbManager.db.prepare(
        `INSERT INTO userRatingChange (userId, eventId, gameId, ratingChange, rating, timestamp)
         VALUES (?, ?, ?, ?, ?, ?)`
    ).run(userId, eventId, gameId, ratingChange, rating, TS);
}

/**
 * Every number on a player's event-stats screen comes out of this service, and
 * all of it is arithmetic over the games they played. The figures are small
 * enough to state by hand, so each expectation below is the value worked out
 * from the four games set up in `beforeEach`, not a value read back off the code.
 */
describe('UserStatsService', () => {
    const service = new UserStatsService();
    const userService = new UserService();
    let u1: number;
    let u2: number;

    beforeEach(() => {
        resetTestDatabase();
        gameSequence = 0;
        createCustomEvent(EVENT_ID, 'Stats Season');
        createCustomEvent(OTHER_EVENT_ID, 'Other Season');

        u1 = userService.registerUser('Stats Player', 'statsplayer', 930001, 0).id;
        u2 = userService.registerUser('Other Player', 'otherplayer', 930002, 0).id;

        // Four games for u1: places 1, 2, 4, 1 with one negative score.
        const placings: Array<[number, string]> = [
            [40000, 'EAST'],
            [25000, 'SOUTH'],
            [-5000, 'WEST'],
            [30000, 'NORTH'],
        ];
        placings.forEach(([points, seat], index) => {
            const gameId = insertFinishedGame(EVENT_ID);
            addPlayer(gameId, u1, seat, points);
            // A second player scoring below u1 except in the third game, which
            // is what makes that one a losing game rather than just a low score.
            addPlayer(gameId, u2, 'EAST', points === -5000 ? 10000 : points - 1000);
            addRatingChange(u1, EVENT_ID, gameId, (index + 1) * 1000, 1500);
            addRatingChange(u2, EVENT_ID, gameId, -500, 1400);
        });
    });

    it('returns null for a user who did not play in the event', () => {
        const stranger = userService.registerUser('Absent', 'absent', 930003, 0).id;
        expect(service.getUserEventStats(stranger, EVENT_ID)).toBeNull();
    });

    it('counts only the games played in the requested event', () => {
        const otherGame = insertFinishedGame(OTHER_EVENT_ID);
        addPlayer(otherGame, u1, 'EAST', 99000);
        addRatingChange(u1, OTHER_EVENT_ID, otherGame, 9000, 1900);

        expect(service.getUserEventStats(u1, EVENT_ID)!.gamesPlayed).toBe(4);
        expect(service.getUserEventStats(u1, OTHER_EVENT_ID)!.gamesPlayed).toBe(1);
    });

    it('sums, averages and bounds the points across the played games', () => {
        const stats = service.getUserEventStats(u1, EVENT_ID)!;

        // 40000 + 25000 - 5000 + 30000
        expect(stats.sumOfPoints).toBe(90000);
        expect(stats.averagePoints).toBe(22500);
        expect(stats.maxPoints).toBe(40000);
        expect(stats.minPoints).toBe(-5000);
    });

    it('derives the placement spread from the other players in each game', () => {
        const stats = service.getUserEventStats(u1, EVENT_ID)!;

        // u1 outscores u2 in three games and loses the third: 1st, 1st, 2nd, 1st.
        expect(stats.percentageFirstPlace).toBe(75);
        expect(stats.percentageSecondPlace).toBe(25);
        expect(stats.percentageThirdPlace).toBe(0);
        expect(stats.percentageFourthPlace).toBe(0);
        expect(stats.averagePlace).toBe(1.25);
    });

    it('counts a negative score rather than a losing place', () => {
        // Exactly one of the four games has points below zero. This is a
        // different question from placement: a player can come last on a
        // positive score and first on a negative one.
        expect(service.getUserEventStats(u1, EVENT_ID)!.percentageOfNegativePoints).toBe(25);
    });

    it('reports the share of the event the user played', () => {
        // u2 sat at all four tables too, so the event holds four games and u1
        // played every one of them.
        expect(service.getUserEventStats(u1, EVENT_ID)!.percentageOfGamesPlayedFromAll).toBe(100);
    });

    it('scales the rating and its average increment out of point units', () => {
        const stats = service.getUserEventStats(u1, EVENT_ID)!;

        // Ratings are stored multiplied by the coefficient and shown divided by it.
        expect(stats.playerRating).toBe(1500 / RATING_TO_POINTS_COEFFICIENT);
        // (1000 + 2000 + 3000 + 4000) / 4 games / 1000
        expect(stats.averageIncrement).toBe(2.5);
    });

    it('tracks progress toward the event minimum', () => {
        dbManager.db.prepare('UPDATE event SET minimumGamesForRating = 6 WHERE id = ?').run(EVENT_ID);

        const stats = service.getUserEventStats(u1, EVENT_ID)!;
        expect(stats.minimumGamesPlayed).toBe(false);
        expect(stats.remainingGamesToRating).toBe(2);
    });

    it('never reports a negative remainder once the minimum is met', () => {
        dbManager.db.prepare('UPDATE event SET minimumGamesForRating = 2 WHERE id = ?').run(EVENT_ID);

        const stats = service.getUserEventStats(u1, EVENT_ID)!;
        expect(stats.minimumGamesPlayed).toBe(true);
        expect(stats.remainingGamesToRating).toBe(0);
    });

    // The per-game query inner-joins userRatingChange, so dropping a user's
    // rating rows removes their games from the stats as well: they read as
    // never having played rather than as an error. The
    // UserHasNoRatingDespiteHavingPlayedGames guard in the service is therefore
    // unreachable through ordinary data and only fires on a corrupt database.
    it('treats a user whose rating rows are gone as not having played', () => {
        dbManager.db.prepare('DELETE FROM userRatingChange WHERE userId = ? AND eventId = ?').run(u1, EVENT_ID);

        expect(service.getUserEventStats(u1, EVENT_ID)).toBeNull();
    });
});
