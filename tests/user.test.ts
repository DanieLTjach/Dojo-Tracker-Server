import request from 'supertest';
import express from 'express';
import userRoutes from '../src/routes/UserRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { closeDB } from '../src/db/dbInit.ts';
import { TEST_DB_PATH, cleanupTestDatabase } from './setup.ts';

const app = express();
app.use(express.json());
app.use('/api/users', userRoutes);
app.use(handleErrors);

describe('User API Endpoints', () => {
    const SYSTEM_USER_ID = 0; // System admin user
    let testUserId: number;
    let testUser2Id: number;

    afterAll(() => {
        // Close database connection
        closeDB();
        // Clean up test database files
        cleanupTestDatabase();
    });

    describe('POST /api/users', () => {
        it('should register a new user with telegram', async () => {
            const userData = {
                name: 'Test User',
                telegramUsername: '@testuser',
                telegramId: 123456789,
                createdBy: SYSTEM_USER_ID
            };

            const response = await request(app)
                .post('/api/users')
                .send(userData)
                .expect(201);

            testUserId = response.body.id;
            expect(response.body).toHaveProperty('id');
            expect(response.body.name).toBe(userData.name);
            expect(response.body.telegramUsername).toBe(userData.telegramUsername);
            expect(response.body.telegramId).toBe(userData.telegramId);
            expect(response.body.isActive).toBe(1); // SQLite returns 1 for true
            expect(response.body.isAdmin).toBe(0); // SQLite returns 0 for false
        });

        it('should register a new user without createdBy (defaults to SYSTEM)', async () => {
            const userData = {
                name: 'Test User 2',
                telegramUsername: '@testuser2',
                telegramId: 987654321
            };

            const response = await request(app)
                .post('/api/users')
                .send(userData)
                .expect(201);

            testUser2Id = response.body.id;
            expect(response.body).toHaveProperty('id');
            expect(response.body.name).toBe(userData.name);
        });

        it('should fail when name is missing', async () => {
            const userData = {
                telegramUsername: '@testuser3',
                telegramId: 111222333
            };

            await request(app)
                .post('/api/users')
                .send(userData)
                .expect(400);
        });

        it('should fail when telegram username does not start with @', async () => {
            const userData = {
                name: 'Test User 3',
                telegramUsername: 'testuser3',
                telegramId: 111222333
            };

            await request(app)
                .post('/api/users')
                .send(userData)
                .expect(400);
        });

        it('should fail when telegram ID is not a number', async () => {
            const userData = {
                name: 'Test User 4',
                telegramUsername: '@testuser4',
                telegramId: 'not-a-number'
            };

            await request(app)
                .post('/api/users')
                .send(userData)
                .expect(400);
        });

        it('should fail when registering duplicate telegram username', async () => {
            const userData = {
                name: 'Unique Name',
                telegramUsername: '@testuser',
                telegramId: 999888777,
                createdBy: SYSTEM_USER_ID
            };

            await request(app)
                .post('/api/users')
                .send(userData)
                .expect(400);
        });
    });

    describe('POST /api/users/without-telegram', () => {
        it('should register a new user without telegram', async () => {
            const userData = {
                name: 'User Without Telegram',
                createdBy: SYSTEM_USER_ID
            };

            const response = await request(app)
                .post('/api/users/without-telegram')
                .send(userData)
                .expect(201);

            expect(response.body).toHaveProperty('id');
            expect(response.body.name).toBe(userData.name);
            expect(response.body.telegramUsername).toBeNull();
            expect(response.body.telegramId).toBeNull();
            expect(response.body.isActive).toBe(1); // SQLite returns 1 for true
        });

        it('should fail when name is missing', async () => {
            const userData = {
                createdBy: SYSTEM_USER_ID
            };

            await request(app)
                .post('/api/users/without-telegram')
                .send(userData)
                .expect(400);
        });

        it('should fail when createdBy is missing', async () => {
            const userData = {
                name: 'Another User'
            };

            await request(app)
                .post('/api/users/without-telegram')
                .send(userData)
                .expect(400);
        });
    });

    describe('GET /api/users', () => {
        it('should return all users', async () => {
            const response = await request(app)
                .get('/api/users')
                .expect(200);

            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThan(0);
        });
    });

    describe('GET /api/users/:id', () => {
        it('should return a user by id', async () => {
            const response = await request(app)
                .get(`/api/users/${testUserId}`)
                .expect(200);

            expect(response.body).toHaveProperty('id', testUserId);
            expect(response.body).toHaveProperty('name');
        });

        it('should fail when user id does not exist', async () => {
            await request(app)
                .get('/api/users/99999')
                .expect(404);
        });

        it('should fail when user id is not a number', async () => {
            await request(app)
                .get('/api/users/invalid')
                .expect(400);
        });
    });

    describe('GET /api/users/by-telegram-id/:telegramId', () => {
        it('should return a user by telegram id', async () => {
            const response = await request(app)
                .get('/api/users/by-telegram-id/123456789')
                .expect(200);

            expect(response.body).toHaveProperty('telegramId', 123456789);
            expect(response.body.name).toBe('Test User');
        });

        it('should fail when telegram id does not exist', async () => {
            await request(app)
                .get('/api/users/by-telegram-id/888888888')
                .expect(404);
        });

        it('should fail when telegram id is not a number', async () => {
            await request(app)
                .get('/api/users/by-telegram-id/invalid')
                .expect(400);
        });
    });

    describe('PATCH /api/users/:id', () => {
        it('should update user name', async () => {
            const updateData = {
                name: 'Updated User Name',
                modifiedBy: SYSTEM_USER_ID
            };

            const response = await request(app)
                .patch(`/api/users/${testUserId}`)
                .send(updateData)
                .expect(200);

            expect(response.body.name).toBe(updateData.name);
            expect(response.body.id).toBe(testUserId);
        });

        it('should update user telegram username', async () => {
            const updateData = {
                telegramUsername: '@updatedusername',
                modifiedBy: SYSTEM_USER_ID
            };

            const response = await request(app)
                .patch(`/api/users/${testUserId}`)
                .send(updateData)
                .expect(200);

            expect(response.body.telegramUsername).toBe(updateData.telegramUsername);
        });

        it('should update both name and telegram username', async () => {
            const updateData = {
                name: 'Another Update',
                telegramUsername: '@anotherupdate',
                modifiedBy: SYSTEM_USER_ID
            };

            const response = await request(app)
                .patch(`/api/users/${testUserId}`)
                .send(updateData)
                .expect(200);

            expect(response.body.name).toBe(updateData.name);
            expect(response.body.telegramUsername).toBe(updateData.telegramUsername);
        });

        it('should fail when neither name nor telegram username is provided', async () => {
            const updateData = {
                modifiedBy: SYSTEM_USER_ID
            };

            await request(app)
                .patch(`/api/users/${testUserId}`)
                .send(updateData)
                .expect(400);
        });

        it('should fail when modifiedBy is missing', async () => {
            const updateData = {
                name: 'Test Name'
            };

            await request(app)
                .patch(`/api/users/${testUserId}`)
                .send(updateData)
                .expect(400);
        });

        it('should fail when user id does not exist', async () => {
            const updateData = {
                name: 'Test Name',
                modifiedBy: SYSTEM_USER_ID
            };

            await request(app)
                .patch('/api/users/99999')
                .send(updateData)
                .expect(404);
        });
    });

    describe('POST /api/users/:id/activate', () => {
        it('should activate a user', async () => {
            const response = await request(app)
                .post(`/api/users/${testUserId}/activate`)
                .send({ modifiedBy: SYSTEM_USER_ID })
                .expect(200);

            expect(response.body.isActive).toBe(1); // SQLite returns 1 for true
            expect(response.body.id).toBe(testUserId);
        });

        it('should fail when modifiedBy is missing', async () => {
            await request(app)
                .post(`/api/users/${testUserId}/activate`)
                .send({})
                .expect(400);
        });

        it('should fail when user id does not exist', async () => {
            await request(app)
                .post('/api/users/99999/activate')
                .send({ modifiedBy: SYSTEM_USER_ID })
                .expect(404);
        });
    });

    describe('POST /api/users/:id/deactivate', () => {
        it('should deactivate a user', async () => {
            const response = await request(app)
                .post(`/api/users/${testUserId}/deactivate`)
                .send({ modifiedBy: SYSTEM_USER_ID })
                .expect(200);

            expect(response.body.isActive).toBe(0); // SQLite returns 0 for false
            expect(response.body.id).toBe(testUserId);
        });

        it('should fail when modifiedBy is missing', async () => {
            await request(app)
                .post(`/api/users/${testUserId}/deactivate`)
                .send({})
                .expect(400);
        });

        it('should fail when user id does not exist', async () => {
            await request(app)
                .post('/api/users/99999/deactivate')
                .send({ modifiedBy: SYSTEM_USER_ID })
                .expect(404);
        });
    });
});
