import request from 'supertest';
import express from 'express';
import gameRoutes from '../src/routes/GameRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { createAuthHeader, resetTestDatabase } from './testHelpers.ts';

const app = express();
app.use(express.json());
app.use('/api/games', gameRoutes);
app.use(handleErrors);

describe('POST /api/games/score-preview', () => {
    const authHeader = createAuthHeader(0);

    beforeAll(() => {
        dbManager.reinitDB();
    });

    // Leave a clean, migrated database behind rather than deleting the shared
    // file — suites run in one process under --runInBand.
    afterAll(() => {
        resetTestDatabase();
    });

    const validPayload = {
        gameRulesId: 1,
        players: [
            { userId: 1, points: 25000, startPlace: 'EAST', chomboCount: 0 },
            { userId: 2, points: 25000, startPlace: 'SOUTH', chomboCount: 0 },
            { userId: 3, points: 25000, startPlace: 'WEST', chomboCount: 0 },
            { userId: 4, points: 25000, startPlace: 'NORTH', chomboCount: 0 },
        ],
        currentState: {
            wind: 'EAST',
            dealerNumber: 1,
            counters: 0,
            riichiSticks: 0,
        },
        result: {
            type: 'TSUMO',
            winningHandData: { winnerPlayerId: 1, yakumanCount: 0, han: 3, fu: 30 },
            riichiPlayerIds: [],
        },
    };

    it('returns 200 and calculated deltas on valid request', async () => {
        const response = await request(app)
            .post('/api/games/score-preview')
            .set('Authorization', authHeader)
            .send(validPayload);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('playerPointChanges');
        expect(response.body.playerPointChanges).toEqual(
            expect.arrayContaining([
                { playerId: 1, pointChange: 6000 },
                { playerId: 2, pointChange: -2000 },
                { playerId: 3, pointChange: -2000 },
                { playerId: 4, pointChange: -2000 },
            ])
        );
    });

    it('returns 400 on malformed body', async () => {
        const response = await request(app)
            .post('/api/games/score-preview')
            .set('Authorization', authHeader)
            .send({ ...validPayload, players: [] });

        expect(response.status).toBe(400);
    });

    it('returns 404 on unknown gameRulesId', async () => {
        const response = await request(app)
            .post('/api/games/score-preview')
            .set('Authorization', authHeader)
            .send({ ...validPayload, gameRulesId: 99999 });

        expect(response.status).toBe(404);
    });

    it('returns 401 when unauthenticated', async () => {
        const response = await request(app)
            .post('/api/games/score-preview')
            .send(validPayload);

        expect(response.status).toBe(401);
    });
});
