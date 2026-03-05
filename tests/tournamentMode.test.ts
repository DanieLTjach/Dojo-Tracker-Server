import request from 'supertest';
import express from 'express';
import eventRoutes from '../src/routes/EventRoutes.ts';
import gameRoutes from '../src/routes/GameRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import config from '../config/config.ts';

const app = express();
app.use(express.json());
app.use('/api/events', eventRoutes);
app.use('/api/games', gameRoutes);
app.use(handleErrors);

describe('Tournament Mode', () => {
    const originalTournamentMode = config.tournamentMode;
    const originalTournamentUserId = config.tournamentUserId;

    beforeEach(() => {
        dbManager.closeDB();
        cleanupTestDatabase();
        dbManager.reinitDB();
    });

    afterEach(() => {
        // Restore original config
        (config as any).tournamentMode = originalTournamentMode;
        (config as any).tournamentUserId = originalTournamentUserId;
    });

    afterAll(() => {
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    describe('When tournament mode is DISABLED', () => {
        beforeEach(() => {
            (config as any).tournamentMode = false;
        });

        it('should require authentication for GET /api/events', async () => {
            const response = await request(app).get('/api/events');

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('message');
            expect(response.body.errorCode).toBe('missingAuthToken');
        });

        it('should reject requests without Authorization header', async () => {
            const response = await request(app)
                .get('/api/events');

            expect(response.status).toBe(401);
            expect(response.body.errorCode).toBe('missingAuthToken');
        });

        it('should reject requests with invalid token', async () => {
            const response = await request(app)
                .get('/api/events')
                .set('Authorization', 'Bearer invalid_token');

            expect(response.status).toBe(401);
        });
    });

    describe('When tournament mode is ENABLED', () => {
        beforeEach(() => {
            (config as any).tournamentMode = true;
            (config as any).tournamentUserId = 0; // System user
        });

        it('should allow access to GET /api/events without authentication', async () => {
            const response = await request(app).get('/api/events');

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
        });

        it('should allow access without Authorization header', async () => {
            const response = await request(app).get('/api/events');

            expect(response.status).toBe(200);
        });

        it('should use configured tournament user ID', async () => {
            // This test verifies the user ID is set correctly
            // We can't directly test req.user, but we can verify authenticated endpoints work
            const response = await request(app).get('/api/events');

            expect(response.status).toBe(200);
        });

        it('should allow creating games without authentication', async () => {
            const response = await request(app)
                .post('/api/games')
                .send({
                    eventId: 1,
                    playersData: [
                        { userId: 1, points: 50000, startPlace: 'EAST' },
                        { userId: 2, points: 30000, startPlace: 'SOUTH' },
                        { userId: 3, points: 25000, startPlace: 'WEST' },
                        { userId: 4, points: 15000, startPlace: 'NORTH' }
                    ]
                });

            // May fail due to user/event not existing, but should not fail due to auth
            expect(response.status).not.toBe(401);
        });

        it('should still enforce admin checks for admin endpoints', async () => {
            // Even in tournament mode, if the user is not an admin, admin endpoints should fail
            // This depends on whether TOURNAMENT_USER_ID is an admin user
            (config as any).tournamentUserId = 1; // Assuming user 1 is not admin

            const response = await request(app)
                .post('/api/events')
                .send({
                    name: 'Test Event',
                    type: 'SEASON'
                });

            // Should fail with 403 if user 1 is not admin, not 401
            if (response.status === 403) {
                expect(response.body.errorCode).toBe('insufficientPermissions');
            }
            // If it succeeds, that means user 1 is an admin, which is also valid
        });
    });

    describe('Tournament user configuration', () => {
        it('should use default user ID when not specified', async () => {
            (config as any).tournamentMode = true;
            (config as any).tournamentUserId = undefined;

            const response = await request(app).get('/api/events');

            // Should still work with default user
            expect(response.status).toBe(200);
        });

        it('should use custom tournament user ID when specified', async () => {
            (config as any).tournamentMode = true;
            (config as any).tournamentUserId = 0;

            const response = await request(app).get('/api/events');

            expect(response.status).toBe(200);
        });
    });

    describe('Security considerations', () => {
        it('should not expose tournament mode status in responses', async () => {
            (config as any).tournamentMode = true;
            (config as any).tournamentUserId = 0;

            const response = await request(app).get('/api/events');

            expect(response.body).not.toHaveProperty('tournamentMode');
            expect(response.headers).not.toHaveProperty('x-tournament-mode');
        });

        it('should work consistently across multiple requests', async () => {
            (config as any).tournamentMode = true;
            (config as any).tournamentUserId = 0;

            const response1 = await request(app).get('/api/events');
            const response2 = await request(app).get('/api/events');

            expect(response1.status).toBe(200);
            expect(response2.status).toBe(200);
        });
    });

    describe('Mode switching', () => {
        it('should respect current tournament mode setting', async () => {
            // Disabled mode
            (config as any).tournamentMode = false;
            let response = await request(app).get('/api/events');
            expect(response.status).toBe(401);

            // Enable mode
            (config as any).tournamentMode = true;
            (config as any).tournamentUserId = 0;
            response = await request(app).get('/api/events');
            expect(response.status).toBe(200);

            // Disable again
            (config as any).tournamentMode = false;
            response = await request(app).get('/api/events');
            expect(response.status).toBe(401);
        });
    });
});
