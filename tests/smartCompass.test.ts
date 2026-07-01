import request from 'supertest';
import express from 'express';
import gameRoutes from '../src/routes/GameRoutes.ts';
import smartCompassRoutes from '../src/routes/SmartCompassRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createAuthHeader, createTestEvent } from './testHelpers.ts';
import { UserService } from '../src/service/UserService.ts';
import { UserRepository } from '../src/repository/UserRepository.ts';

const app = express();
app.use(express.json());
app.use('/api/games', gameRoutes);
app.use('/api/smart-compass', smartCompassRoutes);
app.use(handleErrors);

describe('Smart Compass pairing', () => {
    const TEST_EVENT_ID = 1000;
    const userService = new UserService();
    const userRepository = new UserRepository();
    let player1Id: number;
    let player2Id: number;
    let player3Id: number;
    let player4Id: number;
    let unrelatedUserId: number;
    let player1AuthHeader: string;
    let unrelatedAuthHeader: string;

    beforeAll(() => {
        createTestEvent();
        player1Id = createActiveUser('Compass Player 1', 'compass_player_1', 810001);
        player2Id = createActiveUser('Compass Player 2', 'compass_player_2', 810002);
        player3Id = createActiveUser('Compass Player 3', 'compass_player_3', 810003);
        player4Id = createActiveUser('Compass Player 4', 'compass_player_4', 810004);
        unrelatedUserId = createActiveUser('Compass Non Player', 'compass_non_player', 810005);

        for (const userId of [player1Id, player2Id, player3Id, player4Id, unrelatedUserId]) {
            seedClubMembership(1, userId);
        }

        player1AuthHeader = createAuthHeader(player1Id);
        unrelatedAuthHeader = createAuthHeader(unrelatedUserId);
    });

    afterAll(() => {
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    test('creates and redeems a single-use one-game session', async () => {
        const gameId = await createTrackedGame();

        const pairingResponse = await request(app)
            .post(`/api/games/${gameId}/smart-compass/pairing-codes`)
            .set('Authorization', player1AuthHeader)
            .expect(201);

        expect(pairingResponse.body).toMatchObject({
            gameId,
            ttlSeconds: 300,
        });
        expect(pairingResponse.body.code).toMatch(/^\d{8}$/);

        const sessionResponse = await request(app)
            .post('/api/smart-compass/sessions')
            .send({ code: pairingResponse.body.code, deviceLabel: 'Table 1 Compass' })
            .expect(201);

        expect(sessionResponse.body).toMatchObject({
            tokenType: 'Bearer',
            gameId,
        });
        expect(sessionResponse.body.accessToken).toEqual(expect.any(String));

        await request(app)
            .post('/api/smart-compass/sessions')
            .send({ code: pairingResponse.body.code, deviceLabel: 'Replay Attempt' })
            .expect(401);
    });

    test('rejects invalid and expired pairing codes', async () => {
        await request(app)
            .post('/api/smart-compass/sessions')
            .send({ code: '00000000' })
            .expect(401);

        const gameId = await createTrackedGame();
        const pairingResponse = await request(app)
            .post(`/api/games/${gameId}/smart-compass/pairing-codes`)
            .set('Authorization', player1AuthHeader)
            .expect(201);

        dbManager.db.prepare(`
            UPDATE smartCompassPairingCode
            SET expiresAt = ?
            WHERE gameId = ?
              AND redeemedAt IS NULL
        `).run('2020-01-01T00:00:00.000Z', gameId);

        await request(app)
            .post('/api/smart-compass/sessions')
            .send({ code: pairingResponse.body.code })
            .expect(401);
    });

    test('requires game permissions and rejects finished games when creating codes', async () => {
        const gameId = await createTrackedGame();

        const unauthorizedResponse = await request(app)
            .post(`/api/games/${gameId}/smart-compass/pairing-codes`)
            .set('Authorization', unrelatedAuthHeader)
            .expect(403);
        expect(unauthorizedResponse.body.errorCode).toBe('notAuthorizedToModifyGame');

        dbManager.db.prepare('UPDATE game SET status = ? WHERE id = ?').run('FINISHED', gameId);

        const finishedResponse = await request(app)
            .post(`/api/games/${gameId}/smart-compass/pairing-codes`)
            .set('Authorization', player1AuthHeader)
            .expect(400);
        expect(finishedResponse.body.errorCode).toBe('cannotPairFinishedGame');
    });

    test('uses compass token for live-game read, submit, preview, rollback, and finish on the paired game', async () => {
        const createdGameId = await createTrackedGame('CREATED');
        const createdGameToken = await createCompassSession(createdGameId);
        const startResponse = await request(app)
            .post(`/api/games/${createdGameId}/start`)
            .set('Authorization', `Bearer ${createdGameToken}`)
            .expect(200);
        expect(startResponse.body.status).toBe('IN_PROGRESS');

        const gameId = await createTrackedGame();
        const token = await createCompassSession(gameId);
        const authHeader = `Bearer ${token}`;

        const gameResponse = await request(app)
            .get(`/api/games/${gameId}`)
            .set('Authorization', authHeader)
            .expect(200);
        expect(gameResponse.body.id).toBe(gameId);

        const previewResponse = await request(app)
            .post(`/api/games/${gameId}/rounds/1/preview`)
            .set('Authorization', authHeader)
            .send(exhaustiveDrawBody())
            .expect(200);
        expect(previewResponse.body).toHaveProperty('playerPointChanges');

        const postRoundResponse = await request(app)
            .post(`/api/games/${gameId}/rounds/1`)
            .set('Authorization', authHeader)
            .send(exhaustiveDrawBody())
            .expect(200);
        expect(postRoundResponse.body.rounds).toHaveLength(1);

        const rollbackResponse = await request(app)
            .delete(`/api/games/${gameId}/rounds/1`)
            .set('Authorization', authHeader)
            .expect(200);
        expect(rollbackResponse.body.rounds).toHaveLength(0);

        await request(app)
            .post(`/api/games/${gameId}/rounds/1`)
            .set('Authorization', authHeader)
            .send(exhaustiveDrawBody())
            .expect(200);

        const finishResponse = await request(app)
            .post(`/api/games/${gameId}/finish`)
            .set('Authorization', authHeader)
            .expect(200);
        expect(finishResponse.body.status).toBe('FINISHED');
    });

    test('scopes compass token to one game and keeps broad game routes JWT-only', async () => {
        const pairedGameId = await createTrackedGame();
        const otherGameId = await createTrackedGame();
        const token = await createCompassSession(pairedGameId);
        const authHeader = `Bearer ${token}`;

        const otherGameResponse = await request(app)
            .get(`/api/games/${otherGameId}`)
            .set('Authorization', authHeader)
            .expect(403);
        expect(otherGameResponse.body.errorCode).toBe('smartCompassSessionScope');

        await request(app)
            .post('/api/games/tracked')
            .set('Authorization', authHeader)
            .send(trackedGameBody())
            .expect(401);

        await request(app)
            .put(`/api/games/${pairedGameId}`)
            .set('Authorization', authHeader)
            .send({
                eventId: TEST_EVENT_ID,
                playersData: [
                    { userId: player1Id, points: 30000, startPlace: 'EAST' },
                    { userId: player2Id, points: 30000, startPlace: 'SOUTH' },
                    { userId: player3Id, points: 30000, startPlace: 'WEST' },
                    { userId: player4Id, points: 30000, startPlace: 'NORTH' },
                ],
            })
            .expect(401);
    });

    test('lists and revokes compass sessions', async () => {
        const gameId = await createTrackedGame();
        const token = await createCompassSession(gameId, 'Revokable Compass');

        const listResponse = await request(app)
            .get(`/api/games/${gameId}/smart-compass/sessions`)
            .set('Authorization', player1AuthHeader)
            .expect(200);
        expect(listResponse.body).toHaveLength(1);
        expect(listResponse.body[0]).toMatchObject({
            gameId,
            deviceLabel: 'Revokable Compass',
            createdBy: player1Id,
            isActive: true,
        });

        await request(app)
            .delete(`/api/games/${gameId}/smart-compass/sessions/${listResponse.body[0].id}`)
            .set('Authorization', player1AuthHeader)
            .expect(204);

        const revokedResponse = await request(app)
            .get(`/api/games/${gameId}`)
            .set('Authorization', `Bearer ${token}`)
            .expect(401);
        expect(revokedResponse.body.errorCode).toBe('invalidSmartCompassSessionToken');
    });

    test('rejects expired sessions and sessions for finished games', async () => {
        const expiredGameId = await createTrackedGame();
        const expiredToken = await createCompassSession(expiredGameId);
        const expiredSessionId = await getOnlySessionId(expiredGameId);

        dbManager.db.prepare(`
            UPDATE smartCompassSession
            SET expiresAt = ?
            WHERE id = ?
        `).run('2020-01-01T00:00:00.000Z', expiredSessionId);

        const expiredResponse = await request(app)
            .get(`/api/games/${expiredGameId}`)
            .set('Authorization', `Bearer ${expiredToken}`)
            .expect(401);
        expect(expiredResponse.body.errorCode).toBe('smartCompassSessionExpired');

        const finishedGameId = await createTrackedGame();
        const finishedToken = await createCompassSession(finishedGameId);
        dbManager.db.prepare('UPDATE game SET status = ? WHERE id = ?').run('FINISHED', finishedGameId);

        const finishedResponse = await request(app)
            .get(`/api/games/${finishedGameId}`)
            .set('Authorization', `Bearer ${finishedToken}`)
            .expect(401);
        expect(finishedResponse.body.errorCode).toBe('smartCompassSessionForFinishedGame');
    });

    test('keeps existing JWT live-game access working', async () => {
        const gameId = await createTrackedGame();

        const response = await request(app)
            .get(`/api/games/${gameId}`)
            .set('Authorization', player1AuthHeader)
            .expect(200);

        expect(response.body.id).toBe(gameId);
    });

    function createActiveUser(name: string, username: string, telegramId: number): number {
        const user = userService.registerUser(name, username, telegramId, 0);
        userRepository.updateUserStatus(user.id, true, 'ACTIVE', 0);
        return user.id;
    }

    function seedClubMembership(clubId: number, userId: number): void {
        const ts = new Date().toISOString();
        dbManager.db.prepare(
            `INSERT OR IGNORE INTO clubMembership (clubId, userId, role, status, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, 'MEMBER', 'ACTIVE', ?, ?, 0)`
        ).run(clubId, userId, ts, ts);
    }

    async function createTrackedGame(status: 'CREATED' | 'IN_PROGRESS' = 'IN_PROGRESS'): Promise<number> {
        const response = await request(app)
            .post('/api/games/tracked')
            .set('Authorization', player1AuthHeader)
            .send(trackedGameBody(status))
            .expect(201);
        return response.body.id;
    }

    function trackedGameBody(status: 'CREATED' | 'IN_PROGRESS' = 'IN_PROGRESS') {
        return {
            eventId: TEST_EVENT_ID,
            players: [
                { userId: player1Id, startPlace: 'EAST' },
                { userId: player2Id, startPlace: 'SOUTH' },
                { userId: player3Id, startPlace: 'WEST' },
                { userId: player4Id, startPlace: 'NORTH' },
            ],
            status,
        };
    }

    async function createCompassSession(gameId: number, deviceLabel = 'Test Compass'): Promise<string> {
        const pairingResponse = await request(app)
            .post(`/api/games/${gameId}/smart-compass/pairing-codes`)
            .set('Authorization', player1AuthHeader)
            .expect(201);
        const sessionResponse = await request(app)
            .post('/api/smart-compass/sessions')
            .send({ code: pairingResponse.body.code, deviceLabel })
            .expect(201);
        return sessionResponse.body.accessToken;
    }

    async function getOnlySessionId(gameId: number): Promise<number> {
        const listResponse = await request(app)
            .get(`/api/games/${gameId}/smart-compass/sessions`)
            .set('Authorization', player1AuthHeader)
            .expect(200);
        expect(listResponse.body).toHaveLength(1);
        return listResponse.body[0].id;
    }

    function exhaustiveDrawBody() {
        return {
            type: 'EXHAUSTIVE_DRAW',
            riichiPlayerIds: [],
            tenpaiPlayerIds: [],
            nagashiManganPlayerIds: [],
        };
    }
});
