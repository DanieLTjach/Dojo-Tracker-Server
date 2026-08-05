import request from 'supertest';
import express from 'express';
import userRoutes from '../src/routes/UserRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createAuthHeader, createCustomEvent } from './testHelpers.ts';
import { GameRepository } from '../src/repository/GameRepository.ts';
import { GameRulesRepository } from '../src/repository/GameRulesRepository.ts';
import { RatingService } from '../src/service/RatingService.ts';

const app = express();
app.use(express.json());
app.use('/api/users', userRoutes);
app.use(handleErrors);

describe('PlacementHistory API (/api/users/:id/placements)', () => {
    const userAuthHeader = createAuthHeader(101);

    const CLUB_1 = 1;
    const CLUB_2 = 2;
    const USER_1 = 101;
    const USER_2 = 102;
    const USER_3 = 103;
    const USER_4 = 104;

    const TOURNAMENT_EVENT_ID = 2001;
    const SEASON_EVENT_ID = 2002;

    let gameRepo: GameRepository;
    let gameRulesRepo: GameRulesRepository;
    let ratingService: RatingService;

    beforeEach(() => {
        dbManager.closeDB();
        cleanupTestDatabase();
        dbManager.reinitDB();

        gameRepo = new GameRepository();
        gameRulesRepo = new GameRulesRepository();
        ratingService = new RatingService();

        const now = '2025-01-01T00:00:00.000Z';

        // Insert clubs
        dbManager.db.prepare(
            `INSERT OR IGNORE INTO club (id, name, isActive, createdAt, modifiedAt, modifiedBy)
             VALUES (?, 'Club One', 1, ?, ?, 0)`
        ).run(CLUB_1, now, now);

        dbManager.db.prepare(
            `INSERT OR IGNORE INTO club (id, name, isActive, createdAt, modifiedAt, modifiedBy)
             VALUES (?, 'Club Two', 1, ?, ?, 0)`
        ).run(CLUB_2, now, now);

        // Insert users
        for (
            const [id, name] of [
                [USER_1, 'Alice'],
                [USER_2, 'Bob'],
                [USER_3, 'Charlie'],
                [USER_4, 'David'],
            ] as const
        ) {
            dbManager.db.prepare(
                `INSERT INTO user (id, name, isAdmin, isActive, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, 0, 1, ?, ?, 0)`
            ).run(id, name, now, now);
        }
    });

    afterAll(() => {
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    it('requires authentication (401)', async () => {
        const response = await request(app).get(`/api/users/${USER_1}/placements`);
        expect(response.status).toBe(401);
    });

    it('returns 404 for non-existent user', async () => {
        const response = await request(app)
            .get('/api/users/99999/placements')
            .set('Authorization', userAuthHeader);

        expect(response.status).toBe(404);
    });

    it('returns empty tournaments and seasons arrays for user with no games (200)', async () => {
        const response = await request(app)
            .get(`/api/users/${USER_1}/placements`)
            .set('Authorization', userAuthHeader);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            userId: USER_1,
            tournaments: [],
            seasons: [],
        });
    });

    it('correctly categorizes tournaments and seasons with placements and minimumGamesPlayed flag', async () => {
        // Create a Tournament with minimumGamesForRating = 1
        createCustomEvent(
            TOURNAMENT_EVENT_ID,
            'Winter Championship',
            '2025-01-10T00:00:00.000Z',
            '2025-01-10T23:59:59.000Z',
            1, // gameRulesId
            CLUB_1,
            'TOURNAMENT'
        );
        dbManager.db.prepare('UPDATE event SET minimumGamesForRating = 1 WHERE id = ?').run(TOURNAMENT_EVENT_ID);

        // Create a Season with minimumGamesForRating = 2
        createCustomEvent(
            SEASON_EVENT_ID,
            'Spring League 2025',
            '2025-02-01T00:00:00.000Z',
            '2025-04-30T23:59:59.000Z',
            1, // gameRulesId
            CLUB_2,
            'SEASON'
        );
        dbManager.db.prepare('UPDATE event SET minimumGamesForRating = 2 WHERE id = ?').run(SEASON_EVENT_ID);

        const gameRules = gameRulesRepo.findGameRulesById(1)!;

        // Play 1 game in tournament: Alice 1st (+30), Bob 2nd (+10), Charlie 3rd (-10), David 4th (-30)
        const gTourn = gameRepo.createGame(TOURNAMENT_EVENT_ID, 0, new Date('2025-01-10T12:00:00.000Z'), null, null);
        gameRepo.addGamePlayer(gTourn, USER_1, 40000, 'EAST', 0, false, 0);
        gameRepo.addGamePlayer(gTourn, USER_2, 30000, 'SOUTH', 0, false, 0);
        gameRepo.addGamePlayer(gTourn, USER_3, 20000, 'WEST', 0, false, 0);
        gameRepo.addGamePlayer(gTourn, USER_4, 10000, 'NORTH', 0, false, 0);
        ratingService.addRatingChangesFromGame(
            gTourn,
            new Date('2025-01-10T12:00:00.000Z'),
            [
                { userId: USER_1, points: 40000 },
                { userId: USER_2, points: 30000 },
                { userId: USER_3, points: 20000 },
                { userId: USER_4, points: 10000 },
            ],
            TOURNAMENT_EVENT_ID,
            gameRules,
            0
        );

        // Play 1 game in season: Bob 1st, Alice 2nd, Charlie 3rd, David 4th
        // Notice min games in season is 2, so after 1 game Alice has NOT met minimumGamesForRating yet
        const gSeason = gameRepo.createGame(SEASON_EVENT_ID, 0, new Date('2025-02-10T12:00:00.000Z'), null, null);
        gameRepo.addGamePlayer(gSeason, USER_2, 40000, 'EAST', 0, false, 0);
        gameRepo.addGamePlayer(gSeason, USER_1, 30000, 'SOUTH', 0, false, 0);
        gameRepo.addGamePlayer(gSeason, USER_3, 20000, 'WEST', 0, false, 0);
        gameRepo.addGamePlayer(gSeason, USER_4, 10000, 'NORTH', 0, false, 0);
        ratingService.addRatingChangesFromGame(
            gSeason,
            new Date('2025-02-10T12:00:00.000Z'),
            [
                { userId: USER_2, points: 40000 },
                { userId: USER_1, points: 30000 },
                { userId: USER_3, points: 20000 },
                { userId: USER_4, points: 10000 },
            ],
            SEASON_EVENT_ID,
            gameRules,
            0
        );

        const response = await request(app)
            .get(`/api/users/${USER_1}/placements`)
            .set('Authorization', userAuthHeader);

        expect(response.status).toBe(200);
        expect(response.body.userId).toBe(USER_1);

        // Tournaments check
        expect(response.body.tournaments).toHaveLength(1);
        const tourn = response.body.tournaments[0];
        expect(tourn.eventId).toBe(TOURNAMENT_EVENT_ID);
        expect(tourn.eventName).toBe('Winter Championship');
        expect(tourn.eventType).toBe('TOURNAMENT');
        expect(tourn.clubId).toBe(CLUB_1);
        expect(tourn.clubName).toBe('Japan Dojo');
        expect(tourn.gamesPlayed).toBe(1);
        expect(tourn.minimumGamesPlayed).toBe(true);
        expect(tourn.place).toBe(1);
        expect(tourn.totalRankedPlayers).toBe(4);

        // Seasons check (Alice only played 1 game out of 2 min)
        expect(response.body.seasons).toHaveLength(1);
        const season = response.body.seasons[0];
        expect(season.eventId).toBe(SEASON_EVENT_ID);
        expect(season.eventName).toBe('Spring League 2025');
        expect(season.eventType).toBe('SEASON');
        expect(season.clubId).toBe(CLUB_2);
        expect(season.clubName).toBe('Club Two');
        expect(season.gamesPlayed).toBe(1);
        expect(season.minimumGamesPlayed).toBe(false);
        expect(season.place).toBeNull();
    });
});
