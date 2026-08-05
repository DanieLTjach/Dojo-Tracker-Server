import request from 'supertest';
import express from 'express';
import skillRoutes from '../src/routes/SkillRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createAuthHeader, createCustomEvent } from './testHelpers.ts';
import { GameRepository } from '../src/repository/GameRepository.ts';
import { SkillRatingService } from '../src/service/SkillRatingService.ts';

const app = express();
app.use(express.json());
app.use('/api', skillRoutes);
app.use(handleErrors);

describe('Skill Routes API', () => {
    const adminAuthHeader = createAuthHeader(0); // System admin
    const ownerAuthHeader = createAuthHeader(101); // Club owner
    const modAuthHeader = createAuthHeader(102); // Moderator
    const memberAuthHeader = createAuthHeader(103); // Normal member
    const regularAuthHeader = createAuthHeader(104); // Player with no special club role

    const CLUB_1 = 1;
    const CLUB_2 = 2;
    const USER_1 = 101;
    const USER_2 = 102;
    const USER_3 = 103;
    const USER_4 = 104;

    const EVENT_1 = 3001;
    const EVENT_2 = 3002;

    let gameRepo: GameRepository;
    let skillService: SkillRatingService;

    beforeEach(() => {
        dbManager.closeDB();
        cleanupTestDatabase();
        dbManager.reinitDB();

        gameRepo = new GameRepository();
        skillService = new SkillRatingService();

        const now = '2025-01-01T00:00:00.000Z';

        // Insert users
        for (
            const [id, name, isAdmin] of [
                [USER_1, 'Alice', 0],
                [USER_2, 'Bob', 0],
                [USER_3, 'Charlie', 0],
                [USER_4, 'David', 0],
            ] as const
        ) {
            dbManager.db.prepare(
                `INSERT INTO user (id, name, isAdmin, isActive, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, ?, 1, ?, ?, 0)`
            ).run(id, name, isAdmin, now, now);
        }

        // Insert clubs
        dbManager.db.prepare(
            `INSERT OR IGNORE INTO club (id, name, isActive, createdAt, modifiedAt, modifiedBy)
             VALUES (?, 'Club One', 1, ?, ?, 0)`
        ).run(CLUB_1, now, now);

        dbManager.db.prepare(
            `INSERT OR IGNORE INTO club (id, name, isActive, createdAt, modifiedAt, modifiedBy)
             VALUES (?, 'Club Two', 1, ?, ?, 0)`
        ).run(CLUB_2, now, now);

        // Club memberships / roles
        dbManager.db.prepare(
            `INSERT INTO clubMembership (clubId, userId, role, status, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, 'OWNER', 'ACTIVE', ?, ?, 0)`
        ).run(CLUB_1, USER_1, now, now);

        dbManager.db.prepare(
            `INSERT INTO clubMembership (clubId, userId, role, status, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, 'MODERATOR', 'ACTIVE', ?, ?, 0)`
        ).run(CLUB_1, USER_2, now, now);

        dbManager.db.prepare(
            `INSERT INTO clubMembership (clubId, userId, role, status, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, 'MEMBER', 'ACTIVE', ?, ?, 0)`
        ).run(CLUB_1, USER_3, now, now);

        // Create events
        createCustomEvent(EVENT_1, 'Club 1 Event', '2025-01-01T00:00:00.000Z', '2025-12-31T23:59:59.000Z', 1, CLUB_1);
        createCustomEvent(EVENT_2, 'Club 2 Event', '2025-01-01T00:00:00.000Z', '2025-12-31T23:59:59.000Z', 1, CLUB_2);
    });

    afterAll(() => {
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    describe('GET /api/users/:userId/skill', () => {
        it('requires authentication (401)', async () => {
            const res = await request(app).get(`/api/users/${USER_1}/skill`);
            expect(res.status).toBe(401);
        });

        it('returns 404 for non-existent user', async () => {
            const res = await request(app)
                .get('/api/users/99999/skill')
                .set('Authorization', regularAuthHeader);
            expect(res.status).toBe(404);
        });

        it('returns empty skill profile for user with no games (200)', async () => {
            const res = await request(app)
                .get(`/api/users/${USER_1}/skill`)
                .set('Authorization', regularAuthHeader);

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                userId: USER_1,
                primaryClubId: null,
                clubs: [],
            });
        });

        it('selects primaryClubId based on games played, breaking ties with lowest clubId', async () => {
            // 2 games in Club 1
            const g1 = gameRepo.createGame(EVENT_1, 0, new Date('2025-01-10T12:00:00.000Z'), null, null);
            gameRepo.addGamePlayer(g1, USER_1, 40000, 'EAST', 0, false, 0);
            gameRepo.addGamePlayer(g1, USER_2, 30000, 'SOUTH', 0, false, 0);
            gameRepo.addGamePlayer(g1, USER_3, 20000, 'WEST', 0, false, 0);
            gameRepo.addGamePlayer(g1, USER_4, 10000, 'NORTH', 0, false, 0);
            skillService.applyFinishedGame(g1);

            const g2 = gameRepo.createGame(EVENT_1, 0, new Date('2025-01-11T12:00:00.000Z'), null, null);
            gameRepo.addGamePlayer(g2, USER_1, 40000, 'EAST', 0, false, 0);
            gameRepo.addGamePlayer(g2, USER_2, 30000, 'SOUTH', 0, false, 0);
            gameRepo.addGamePlayer(g2, USER_3, 20000, 'WEST', 0, false, 0);
            gameRepo.addGamePlayer(g2, USER_4, 10000, 'NORTH', 0, false, 0);
            skillService.applyFinishedGame(g2);

            // 1 game in Club 2
            const g3 = gameRepo.createGame(EVENT_2, 0, new Date('2025-01-12T12:00:00.000Z'), null, null);
            gameRepo.addGamePlayer(g3, USER_1, 40000, 'EAST', 0, false, 0);
            gameRepo.addGamePlayer(g3, USER_2, 30000, 'SOUTH', 0, false, 0);
            gameRepo.addGamePlayer(g3, USER_3, 20000, 'WEST', 0, false, 0);
            gameRepo.addGamePlayer(g3, USER_4, 10000, 'NORTH', 0, false, 0);
            skillService.applyFinishedGame(g3);

            const res = await request(app)
                .get(`/api/users/${USER_1}/skill`)
                .set('Authorization', regularAuthHeader);

            expect(res.status).toBe(200);
            expect(res.body.userId).toBe(USER_1);
            expect(res.body.primaryClubId).toBe(CLUB_1);
            expect(res.body.clubs).toHaveLength(2);
        });
    });

    describe('GET /api/clubs/:clubId/skill/leaderboard', () => {
        it('requires authentication (401)', async () => {
            const res = await request(app).get(`/api/clubs/${CLUB_1}/skill/leaderboard`);
            expect(res.status).toBe(401);
        });

        it('returns 404 for non-existent club', async () => {
            const res = await request(app)
                .get('/api/clubs/99999/skill/leaderboard')
                .set('Authorization', regularAuthHeader);
            expect(res.status).toBe(404);
        });

        it('returns 400 for invalid gameSize parameter', async () => {
            const res = await request(app)
                .get(`/api/clubs/${CLUB_1}/skill/leaderboard?gameSize=5`)
                .set('Authorization', regularAuthHeader);
            expect(res.status).toBe(400);
        });

        it('returns leaderboard with default gameSize=4 (200)', async () => {
            const res = await request(app)
                .get(`/api/clubs/${CLUB_1}/skill/leaderboard`)
                .set('Authorization', regularAuthHeader);

            expect(res.status).toBe(200);
            expect(res.body.clubId).toBe(CLUB_1);
            expect(res.body.gameSize).toBe(4);
            expect(res.body.isStale).toBe(false);
            expect(Array.isArray(res.body.entries)).toBe(true);
            expect(Array.isArray(res.body.provisionalEntries)).toBe(true);
        });
    });

    describe('Club Skill Config Endpoints', () => {
        it('GET /api/clubs/:clubId/skill/config returns config (200)', async () => {
            const res = await request(app)
                .get(`/api/clubs/${CLUB_1}/skill/config`)
                .set('Authorization', regularAuthHeader);

            expect(res.status).toBe(200);
            expect(res.body.clubId).toBe(CLUB_1);
            expect(res.body.provisionalGameThreshold).toBe(30);
            expect(res.body.isEnabled).toBe(true);
        });

        it('GET /api/clubs/:clubId/skill/config returns 404 for missing club', async () => {
            const res = await request(app)
                .get('/api/clubs/99999/skill/config')
                .set('Authorization', regularAuthHeader);

            expect(res.status).toBe(404);
        });

        it('PATCH /api/clubs/:clubId/skill/config requires OWNER role (403 for member/mod)', async () => {
            const resMod = await request(app)
                .patch(`/api/clubs/${CLUB_1}/skill/config`)
                .set('Authorization', modAuthHeader)
                .send({ provisionalGameThreshold: 15 });

            expect(resMod.status).toBe(403);

            const resMember = await request(app)
                .patch(`/api/clubs/${CLUB_1}/skill/config`)
                .set('Authorization', memberAuthHeader)
                .send({ provisionalGameThreshold: 15 });

            expect(resMember.status).toBe(403);
        });

        it('PATCH /api/clubs/:clubId/skill/config updates config for OWNER (200)', async () => {
            const res = await request(app)
                .patch(`/api/clubs/${CLUB_1}/skill/config`)
                .set('Authorization', ownerAuthHeader)
                .send({ provisionalGameThreshold: 15, isEnabled: false });

            expect(res.status).toBe(200);
            expect(res.body.provisionalGameThreshold).toBe(15);
            expect(res.body.isEnabled).toBe(false);

            // Verify via GET
            const check = await request(app)
                .get(`/api/clubs/${CLUB_1}/skill/config`)
                .set('Authorization', regularAuthHeader);
            expect(check.body.provisionalGameThreshold).toBe(15);
            expect(check.body.isEnabled).toBe(false);
        });

        it('PUT /api/clubs/:clubId/skill/config updates config for OWNER (200)', async () => {
            const res = await request(app)
                .put(`/api/clubs/${CLUB_1}/skill/config`)
                .set('Authorization', ownerAuthHeader)
                .send({ provisionalGameThreshold: 20, isEnabled: true });

            expect(res.status).toBe(200);
            expect(res.body.provisionalGameThreshold).toBe(20);
            expect(res.body.isEnabled).toBe(true);
        });
    });

    describe('POST /api/clubs/:clubId/skill/recompute', () => {
        it('requires OWNER or MODERATOR role (403 for member)', async () => {
            const resMember = await request(app)
                .post(`/api/clubs/${CLUB_1}/skill/recompute`)
                .set('Authorization', memberAuthHeader);

            expect(resMember.status).toBe(403);
        });

        it('recomputes club for MODERATOR (200)', async () => {
            const res = await request(app)
                .post(`/api/clubs/${CLUB_1}/skill/recompute`)
                .set('Authorization', modAuthHeader);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body).toHaveLength(2); // yonma + sanma
        });

        it('recomputes single track when gameSize query param is given (200)', async () => {
            const res = await request(app)
                .post(`/api/clubs/${CLUB_1}/skill/recompute?gameSize=4`)
                .set('Authorization', ownerAuthHeader);

            expect(res.status).toBe(200);
            expect(res.body.gameSize).toBe(4);
            expect(res.body.clubId).toBe(CLUB_1);
        });
    });

    describe('POST /api/admin/skill/recompute', () => {
        it('requires admin authorization (403 for normal user/owner)', async () => {
            const res = await request(app)
                .post('/api/admin/skill/recompute')
                .set('Authorization', ownerAuthHeader);

            expect(res.status).toBe(403);
        });

        it('allows system admin to recompute all clubs (200)', async () => {
            const res = await request(app)
                .post('/api/admin/skill/recompute')
                .set('Authorization', adminAuthHeader);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        });
    });
});
