import request from 'supertest';
import express from 'express';
import gameRulesRoutes from '../src/routes/GameRulesRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { createAuthHeader } from './testHelpers.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';

const app = express();
app.use(express.json());
app.use('/api/game-rules', gameRulesRoutes);
app.use(handleErrors);

describe('Game Rules API Endpoints', () => {
    const SYSTEM_USER_ID = 0;
    const adminAuthHeader = createAuthHeader(SYSTEM_USER_ID);

    afterAll(() => {
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    describe('GET /api/game-rules', () => {
        test('should return list of game rules with correct structure', async () => {
            const response = await request(app)
                .get('/api/game-rules')
                .set('Authorization', adminAuthHeader);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThan(0);

            const gr = response.body[0];
            expect(gr).toHaveProperty('id');
            expect(gr).toHaveProperty('name');
            expect(gr).toHaveProperty('numberOfPlayers');
            expect(gr).toHaveProperty('uma');
            expect(gr).toHaveProperty('startingPoints');
            expect(gr).toHaveProperty('startingRating');
            expect(gr).toHaveProperty('minimumGamesForRating');
            expect(gr).toHaveProperty('chomboPointsAfterUma');
        });

        test('should parse UMA arrays (1D and 2D)', async () => {
            const response = await request(app)
                .get('/api/game-rules')
                .set('Authorization', adminAuthHeader);

            expect(response.status).toBe(200);

            const oneD = response.body.find((gr: any) => gr.id === 1);
            const twoD = response.body.find((gr: any) => gr.id === 2);

            expect(Array.isArray(oneD.uma)).toBe(true);
            oneD.uma.forEach((n: any) => {
                expect(typeof n).toBe('number');
            });

            expect(Array.isArray(twoD.uma)).toBe(true);
            twoD.uma.forEach((row: any) => {
                expect(Array.isArray(row)).toBe(true);
                row.forEach((n: any) => {
                    expect(typeof n).toBe('number');
                });
            });
        });

        test('should filter game rules by clubId including global rules', async () => {
            const clubId = 910;
            const otherClubId = 911;
            const clubRuleId = 9101;
            const globalRuleId = 9102;
            const otherClubRuleId = 9103;
            const timestamp = '2026-01-01T00:00:00.000Z';

            dbManager.db.prepare(
                `INSERT INTO club (id, name, address, city, description, contactInfo, isActive, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(clubId, 'Game Rules Test Club', null, null, null, null, 1, timestamp, timestamp, 0);

            dbManager.db.prepare(
                `INSERT INTO club (id, name, address, city, description, contactInfo, isActive, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(otherClubId, 'Game Rules Test Club 2', null, null, null, null, 1, timestamp, timestamp, 0);

            dbManager.db.prepare(
                `INSERT INTO gameRules (id, name, clubId, numberOfPlayers, uma, startingPoints, startingRating, minimumGamesForRating, chomboPointsAfterUma)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(clubRuleId, 'Club Rule', clubId, 4, '15,5,-5,-15', 30000, 1000, 0, null);

            dbManager.db.prepare(
                `INSERT INTO gameRules (id, name, clubId, numberOfPlayers, uma, startingPoints, startingRating, minimumGamesForRating, chomboPointsAfterUma)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(globalRuleId, 'Global Rule', null, 4, '15,5,-5,-15', 30000, 1000, 0, null);

            dbManager.db.prepare(
                `INSERT INTO gameRules (id, name, clubId, numberOfPlayers, uma, startingPoints, startingRating, minimumGamesForRating, chomboPointsAfterUma)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(otherClubRuleId, 'Other Club Rule', otherClubId, 4, '15,5,-5,-15', 30000, 1000, 0, null);

            const response = await request(app)
                .get(`/api/game-rules?clubId=${clubId}`)
                .set('Authorization', adminAuthHeader);

            dbManager.db.prepare('DELETE FROM gameRules WHERE id IN (?, ?, ?)').run(clubRuleId, globalRuleId, otherClubRuleId);
            dbManager.db.prepare('DELETE FROM club WHERE id IN (?, ?)').run(clubId, otherClubId);

            expect(response.status).toBe(200);
            expect(response.body.some((rule: { id: number }) => rule.id === clubRuleId)).toBe(true);
            expect(response.body.some((rule: { id: number }) => rule.id === globalRuleId)).toBe(true);
            expect(response.body.some((rule: { id: number }) => rule.id === otherClubRuleId)).toBe(false);
        });

        test('should require authentication', async () => {
            const response = await request(app).get('/api/game-rules');
            expect(response.status).toBe(401);
        });
    });

    describe('GET /api/game-rules/:id', () => {
        test('should return game rules by id', async () => {
            const response = await request(app)
                .get('/api/game-rules/1')
                .set('Authorization', adminAuthHeader);

            expect(response.status).toBe(200);
            expect(response.body.id).toBe(1);
            expect(response.body).toHaveProperty('name');
            expect(response.body).toHaveProperty('uma');
        });

        test('should return 404 when not found', async () => {
            const response = await request(app)
                .get('/api/game-rules/99999')
                .set('Authorization', adminAuthHeader);
            expect(response.status).toBe(404);
        });

        test('should return 400 for invalid id', async () => {
            const response = await request(app)
                .get('/api/game-rules/invalid')
                .set('Authorization', adminAuthHeader);
            expect(response.status).toBe(400);
        });

        test('should require authentication', async () => {
            const response = await request(app).get('/api/game-rules/1');
            expect(response.status).toBe(401);
        });
    });
});
