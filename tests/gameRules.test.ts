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

    describe('GET /api/game-rules/catalog', () => {
        test('should return catalog for authenticated user', async () => {
            const response = await request(app)
                .get('/api/game-rules/catalog')
                .set('Authorization', adminAuthHeader);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.rules)).toBe(true);
            expect(response.body.rules.some((rule: { key: string }) => rule.key === 'number_of_players')).toBe(true);
        });

        test('should expose single-value enums for fixed-value rules', async () => {
            const response = await request(app)
                .get('/api/game-rules/catalog')
                .set('Authorization', adminAuthHeader);

            expect(response.status).toBe(200);
            expect(response.body.rules.find((rule: { key: string }) => rule.key === 'after_a_quad')).toMatchObject({
                key: 'after_a_quad',
                type: 'enumInteger',
                enum: [1]
            });
        });

        test('should require authentication', async () => {
            const response = await request(app).get('/api/game-rules/catalog');
            expect(response.status).toBe(401);
        });
    });

    describe('GET /api/game-rules/presets', () => {
        const NON_ADMIN_USER_ID = 9201;
        const nonAdminAuthHeader = createAuthHeader(NON_ADMIN_USER_ID);
        const presetsTimestamp = '2026-01-01T00:00:00.000Z';

        beforeAll(() => {
            dbManager.db.prepare(
                `INSERT OR IGNORE INTO user (id, telegramId, name, isActive, isAdmin, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(NON_ADMIN_USER_ID, 920100, 'presets-nonadmin', 1, 0, presetsTimestamp, presetsTimestamp, 0);
        });

        afterAll(() => {
            dbManager.db.prepare('DELETE FROM user WHERE id = ?').run(NON_ADMIN_USER_ID);
        });

        test('should return presets for an admin', async () => {
            const response = await request(app)
                .get('/api/game-rules/presets')
                .set('Authorization', adminAuthHeader);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body).toHaveLength(3);

            const preset = response.body[0];
            expect(preset).toHaveProperty('key');
            expect(preset).toHaveProperty('name');
            expect(preset).toHaveProperty('extends');
            expect(preset).toHaveProperty('rules');
            expect(preset).toHaveProperty('ownRules');
            expect(typeof preset.rules).toBe('object');
            expect(typeof preset.ownRules).toBe('object');
        });

        test('should include public presets and hide the internal default preset', async () => {
            const response = await request(app)
                .get('/api/game-rules/presets')
                .set('Authorization', adminAuthHeader);

            const keys = response.body.map((p: { key: string }) => p.key);
            expect(keys).toContain('ema_2025');
            expect(keys).toContain('mahjong_soul');
            expect(keys).toContain('mahjong_soul_sanma');
            expect(keys).not.toContain('default');
        });

        test('should expose inheritance metadata for each preset', async () => {
            const response = await request(app)
                .get('/api/game-rules/presets')
                .set('Authorization', adminAuthHeader);

            const byKey = new Map(response.body.map((preset: { key: string }) => [preset.key, preset]));
            expect(byKey.get('ema_2025')).toMatchObject({ extends: 'default' });
            expect(byKey.get('mahjong_soul')).toMatchObject({ extends: 'default' });
            expect(byKey.get('mahjong_soul_sanma')).toMatchObject({ extends: 'mahjong_soul' });
        });

        test('should require authentication', async () => {
            const response = await request(app).get('/api/game-rules/presets');
            expect(response.status).toBe(401);
        });

        test('should reject non-admin users', async () => {
            const response = await request(app)
                .get('/api/game-rules/presets')
                .set('Authorization', nonAdminAuthHeader);
            expect(response.status).toBe(403);
        });
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
                `INSERT INTO gameRules (id, name, clubId, numberOfPlayers, uma, startingPoints, chomboPointsAfterUma)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`
            ).run(clubRuleId, 'Club Rule', clubId, 4, '[15,5,-5,-15]', 30000, null);

            dbManager.db.prepare(
                `INSERT INTO gameRules (id, name, clubId, numberOfPlayers, uma, startingPoints, chomboPointsAfterUma)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`
            ).run(globalRuleId, 'Global Rule', null, 4, '[15,5,-5,-15]', 30000, null);

            dbManager.db.prepare(
                `INSERT INTO gameRules (id, name, clubId, numberOfPlayers, uma, startingPoints, chomboPointsAfterUma)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`
            ).run(otherClubRuleId, 'Other Club Rule', otherClubId, 4, '[15,5,-5,-15]', 30000, null);

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

    describe('PUT /api/game-rules/:id/details', () => {
        test('should update details and return merged preset rules', async () => {
            const clubId = 912;
            const ruleId = 9104;
            const timestamp = '2026-01-01T00:00:00.000Z';

            dbManager.db.prepare(
                `INSERT INTO club (id, name, address, city, description, contactInfo, isActive, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(clubId, 'Details Update Club', null, null, null, null, 1, timestamp, timestamp, 0);

            dbManager.db.prepare(
                `INSERT INTO gameRules (id, name, clubId, numberOfPlayers, uma, startingPoints, chomboPointsAfterUma, umaTieBreak)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(ruleId, 'Details Update Rule', clubId, 4, '[15,5,-5,-15]', 30000, null, 'DIVIDE');

            try {
                const response = await request(app)
                    .put(`/api/game-rules/${ruleId}/details`)
                    .set('Authorization', adminAuthHeader)
                    .send({
                        details: {
                            preset: 'ema_2025',
                            rules: {
                                starting_points: 25000,
                                red_fives: 'three_one_per_suit'
                            }
                        }
                    });

                expect(response.status).toBe(200);
                expect(response.body.details).toMatchObject({
                    preset: 'ema_2025'
                });
                expect(response.body.details.rules.number_of_players).toBe(4);
                expect(response.body.details.rules.open_tanyao).toBe(true);
                expect(response.body.details.rules.starting_points).toBe(25000);
                expect(response.body.details.rules.red_fives).toBe('three_one_per_suit');

                const raw = dbManager.db.prepare('SELECT details FROM gameRules WHERE id = ?').get(ruleId) as { details: string };
                const stored = JSON.parse(raw.details);
                expect(stored).toEqual({
                    preset: 'ema_2025',
                    rules: {
                        starting_points: 25000,
                        red_fives: 'three_one_per_suit'
                    }
                });
            } finally {
                dbManager.db.prepare('DELETE FROM gameRules WHERE id = ?').run(ruleId);
                dbManager.db.prepare('DELETE FROM club WHERE id = ?').run(clubId);
            }
        });

        test('should reject internal presets', async () => {
            const response = await request(app)
                .put('/api/game-rules/1/details')
                .set('Authorization', adminAuthHeader)
                .send({
                    details: {
                        preset: 'default',
                        rules: {}
                    }
                });

            expect(response.status).toBe(400);
        });

        test('should require authentication', async () => {
            const response = await request(app)
                .put('/api/game-rules/1/details')
                .send({
                    details: null
                });

            expect(response.status).toBe(401);
        });

        test('should reject non-admin non-owner users with 403', async () => {
            const clubId = 913;
            const ruleId = 9105;
            const userId = 9106;
            const timestamp = '2026-01-01T00:00:00.000Z';

            dbManager.db.prepare(
                `INSERT INTO club (id, name, address, city, description, contactInfo, isActive, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(clubId, 'PUT Forbidden Club', null, null, null, null, 1, timestamp, timestamp, 0);
            dbManager.db.prepare(
                `INSERT INTO gameRules (id, name, clubId, numberOfPlayers, uma, startingPoints, chomboPointsAfterUma, umaTieBreak)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(ruleId, 'PUT Forbidden Rule', clubId, 4, '[15,5,-5,-15]', 30000, null, 'DIVIDE');
            dbManager.db.prepare(
                `INSERT OR IGNORE INTO user (id, telegramId, name, isActive, isAdmin, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(userId, 910600, 'put-nonowner', 1, 0, timestamp, timestamp, 0);

            try {
                const response = await request(app)
                    .put(`/api/game-rules/${ruleId}/details`)
                    .set('Authorization', createAuthHeader(userId))
                    .send({
                        details: { preset: 'ema_2025', rules: {} }
                    });
                expect(response.status).toBe(403);
            } finally {
                dbManager.db.prepare('DELETE FROM user WHERE id = ?').run(userId);
                dbManager.db.prepare('DELETE FROM gameRules WHERE id = ?').run(ruleId);
                dbManager.db.prepare('DELETE FROM club WHERE id = ?').run(clubId);
            }
        });

        test('should allow club owner to update details', async () => {
            const clubId = 914;
            const ruleId = 9107;
            const ownerId = 9108;
            const timestamp = '2026-01-01T00:00:00.000Z';

            dbManager.db.prepare(
                `INSERT INTO club (id, name, address, city, description, contactInfo, isActive, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(clubId, 'PUT Owner Club', null, null, null, null, 1, timestamp, timestamp, 0);
            dbManager.db.prepare(
                `INSERT INTO gameRules (id, name, clubId, numberOfPlayers, uma, startingPoints, chomboPointsAfterUma, umaTieBreak)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(ruleId, 'PUT Owner Rule', clubId, 4, '[15,5,-5,-15]', 30000, null, 'DIVIDE');
            dbManager.db.prepare(
                `INSERT OR IGNORE INTO user (id, telegramId, name, isActive, isAdmin, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(ownerId, 910800, 'put-owner', 1, 0, timestamp, timestamp, 0);
            dbManager.db.prepare(
                `INSERT INTO clubMembership (clubId, userId, role, status, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`
            ).run(clubId, ownerId, 'OWNER', 'ACTIVE', timestamp, timestamp, 0);

            try {
                const response = await request(app)
                    .put(`/api/game-rules/${ruleId}/details`)
                    .set('Authorization', createAuthHeader(ownerId))
                    .send({
                        details: { preset: 'ema_2025', rules: { starting_points: 25000 } }
                    });
                expect(response.status).toBe(200);
                expect(response.body.details.preset).toBe('ema_2025');
                expect(response.body.details.rules.starting_points).toBe(25000);
            } finally {
                dbManager.db.prepare('DELETE FROM clubMembership WHERE clubId = ? AND userId = ?').run(clubId, ownerId);
                dbManager.db.prepare('DELETE FROM user WHERE id = ?').run(ownerId);
                dbManager.db.prepare('DELETE FROM gameRules WHERE id = ?').run(ruleId);
                dbManager.db.prepare('DELETE FROM club WHERE id = ?').run(clubId);
            }
        });
    });
});
