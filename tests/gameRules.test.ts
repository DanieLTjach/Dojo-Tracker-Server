import request from 'supertest';
import { describe, it, expect, beforeEach } from '@jest/globals';
import { dbManager } from '../src/db/dbInit.ts';
import { createAuthHeader } from './testHelpers.ts';

const BASE_URL = 'http://localhost:3000';

describe('Game Rules API', () => {
    const adminUserId = 1; // Assuming user with ID 1 is admin
    const regularUserId = 999; // Non-admin user

    beforeEach(() => {
        // Clean up game rules table (keep default rules)
        dbManager.db.prepare('DELETE FROM gameRules WHERE id > 2').run();
    });

    describe('GET /api/game-rules', () => {
        it('should return all game rules when authenticated', async () => {
            const response = await request(BASE_URL)
                .get('/api/game-rules')
                .set('Authorization', createAuthHeader(regularUserId));

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThanOrEqual(2);
            
            // Verify structure of first game rule
            const gameRule = response.body[0];
            expect(gameRule).toHaveProperty('id');
            expect(gameRule).toHaveProperty('name');
            expect(gameRule).toHaveProperty('numberOfPlayers');
            expect(gameRule).toHaveProperty('uma');
            expect(gameRule).toHaveProperty('startingPoints');
            expect(gameRule).toHaveProperty('startingRating');
            expect(Array.isArray(gameRule.uma)).toBe(true);
        });

        it('should return 401 without authentication', async () => {
            const response = await request(BASE_URL)
                .get('/api/game-rules');

            expect(response.status).toBe(401);
        });
    });

    describe('GET /api/game-rules/:id', () => {
        it('should return game rules by id', async () => {
            const response = await request(BASE_URL)
                .get('/api/game-rules/1')
                .set('Authorization', createAuthHeader(regularUserId));

            expect(response.status).toBe(200);
            expect(response.body.id).toBe(1);
            expect(response.body.name).toBe('Standard yonma');
            expect(response.body.numberOfPlayers).toBe(4);
            expect(response.body.uma).toEqual([15, 5, -5, -15]);
            expect(response.body.startingPoints).toBe(30000);
            expect(response.body.startingRating).toBe(1000);
        });

        it('should return 404 for non-existent game rules', async () => {
            const response = await request(BASE_URL)
                .get('/api/game-rules/9999')
                .set('Authorization', createAuthHeader(regularUserId));

            expect(response.status).toBe(404);
        });
    });

    describe('POST /api/game-rules', () => {
        it('should create new game rules with simple uma (admin)', async () => {
            const newGameRules = {
                name: 'Test yonma',
                numberOfPlayers: 4,
                uma: [20, 10, -10, -20],
                startingPoints: 30000,
                startingRating: 1000
            };

            const response = await request(BASE_URL)
                .post('/api/game-rules')
                .set('Authorization', createAuthHeader(adminUserId))
                .send(newGameRules);

            expect(response.status).toBe(201);
            expect(response.body).toMatchObject(newGameRules);
            expect(response.body.id).toBeDefined();
        });

        it('should create new game rules with dynamic uma (admin)', async () => {
            const newGameRules = {
                name: 'Dynamic yonma',
                numberOfPlayers: 4,
                uma: [
                    [20, -5, -5, -10],
                    [15, 5, -10, -10],
                    [10, 10, 0, -20],
                    [0, 0, 0, 0]
                ],
                startingPoints: 30000,
                startingRating: 1000
            };

            const response = await request(BASE_URL)
                .post('/api/game-rules')
                .set('Authorization', createAuthHeader(adminUserId))
                .send(newGameRules);

            expect(response.status).toBe(201);
            expect(response.body).toMatchObject(newGameRules);
        });

        it('should reject invalid uma that does not sum to 0', async () => {
            const invalidGameRules = {
                name: 'Invalid uma',
                numberOfPlayers: 4,
                uma: [20, 10, -10, -10], // Sums to 10, not 0
                startingPoints: 30000,
                startingRating: 1000
            };

            const response = await request(BASE_URL)
                .post('/api/game-rules')
                .set('Authorization', createAuthHeader(adminUserId))
                .send(invalidGameRules);

            expect(response.status).toBe(400);
        });

        it('should reject uma length mismatch with numberOfPlayers', async () => {
            const invalidGameRules = {
                name: 'Mismatched uma',
                numberOfPlayers: 4,
                uma: [15, 0, -15], // 3 players uma for 4 player game
                startingPoints: 30000,
                startingRating: 1000
            };

            const response = await request(BASE_URL)
                .post('/api/game-rules')
                .set('Authorization', createAuthHeader(adminUserId))
                .send(invalidGameRules);

            expect(response.status).toBe(400);
        });

        it('should reject non-admin users', async () => {
            const newGameRules = {
                name: 'Test yonma',
                numberOfPlayers: 4,
                uma: [20, 10, -10, -20],
                startingPoints: 30000,
                startingRating: 1000
            };

            const response = await request(BASE_URL)
                .post('/api/game-rules')
                .set('Authorization', createAuthHeader(regularUserId))
                .send(newGameRules);

            expect(response.status).toBe(403);
        });
    });

    describe('PUT /api/game-rules/:id', () => {
        it('should update game rules (admin)', async () => {
            // First create a game rule
            const createResponse = await request(BASE_URL)
                .post('/api/game-rules')
                .set('Authorization', createAuthHeader(adminUserId))
                .send({
                    name: 'Original name',
                    numberOfPlayers: 4,
                    uma: [15, 5, -5, -15],
                    startingPoints: 30000,
                    startingRating: 1000
                });

            const gameRulesId = createResponse.body.id;

            // Update it
            const updateResponse = await request(BASE_URL)
                .put(`/api/game-rules/${gameRulesId}`)
                .set('Authorization', createAuthHeader(adminUserId))
                .send({
                    name: 'Updated name',
                    uma: [20, 10, -10, -20]
                });

            expect(updateResponse.status).toBe(200);
            expect(updateResponse.body.name).toBe('Updated name');
            expect(updateResponse.body.uma).toEqual([20, 10, -10, -20]);
            expect(updateResponse.body.numberOfPlayers).toBe(4); // Unchanged
        });

        it('should return 404 for non-existent game rules', async () => {
            const response = await request(BASE_URL)
                .put('/api/game-rules/9999')
                .set('Authorization', createAuthHeader(adminUserId))
                .send({ name: 'New name' });

            expect(response.status).toBe(404);
        });

        it('should reject non-admin users', async () => {
            const response = await request(BASE_URL)
                .put('/api/game-rules/1')
                .set('Authorization', createAuthHeader(regularUserId))
                .send({ name: 'New name' });

            expect(response.status).toBe(403);
        });
    });

    describe('DELETE /api/game-rules/:id', () => {
        it('should delete game rules not used by events (admin)', async () => {
            // Create a game rule
            const createResponse = await request(BASE_URL)
                .post('/api/game-rules')
                .set('Authorization', createAuthHeader(adminUserId))
                .send({
                    name: 'To be deleted',
                    numberOfPlayers: 4,
                    uma: [15, 5, -5, -15],
                    startingPoints: 30000,
                    startingRating: 1000
                });

            const gameRulesId = createResponse.body.id;

            // Delete it
            const deleteResponse = await request(BASE_URL)
                .delete(`/api/game-rules/${gameRulesId}`)
                .set('Authorization', createAuthHeader(adminUserId));

            expect(deleteResponse.status).toBe(204);

            // Verify it's deleted
            const getResponse = await request(BASE_URL)
                .get(`/api/game-rules/${gameRulesId}`)
                .set('Authorization', createAuthHeader(adminUserId));

            expect(getResponse.status).toBe(404);
        });

        it('should return 404 for non-existent game rules', async () => {
            const response = await request(BASE_URL)
                .delete('/api/game-rules/9999')
                .set('Authorization', createAuthHeader(adminUserId));

            expect(response.status).toBe(404);
        });

        it('should reject non-admin users', async () => {
            const response = await request(BASE_URL)
                .delete('/api/game-rules/1')
                .set('Authorization', createAuthHeader(regularUserId));

            expect(response.status).toBe(403);
        });
    });
});
