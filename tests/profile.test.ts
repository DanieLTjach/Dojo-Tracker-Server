import request from 'supertest';
import express from 'express';
import userRoutes from '../src/routes/UserRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createAuthHeader } from './testHelpers.ts';

const app = express();
app.use(express.json());
app.use('/api/users', userRoutes);
app.use(handleErrors);

describe('Profile API Endpoints', () => {
    const SYSTEM_USER_ID = 0;
    const adminAuthHeader = createAuthHeader(SYSTEM_USER_ID);

    let testUserId: number;
    let testUser2Id: number;
    let regularUserAuthHeader: string;

    afterAll(() => {
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    beforeAll(async () => {
        // Register and activate test user
        const res1 = await request(app)
            .post('/api/users')
            .send({ name: 'Profile Test User', telegramUsername: '@profiletest', telegramId: 100100100 })
            .expect(201);
        testUserId = res1.body.id;

        await request(app)
            .post(`/api/users/${testUserId}/activate`)
            .set('Authorization', adminAuthHeader)
            .send({});
        regularUserAuthHeader = createAuthHeader(testUserId);

        // Register and activate second test user
        const res2 = await request(app)
            .post('/api/users')
            .send({ name: 'Profile Test User 2', telegramUsername: '@profiletest2', telegramId: 200200200 })
            .expect(201);
        testUser2Id = res2.body.id;

        await request(app)
            .post(`/api/users/${testUser2Id}/activate`)
            .set('Authorization', adminAuthHeader)
            .send({});
    });

    describe('GET /api/users/:id/profile', () => {
        it('should return null when no profile exists', async () => {
            const response = await request(app)
                .get(`/api/users/${testUserId}/profile`)
                .set('Authorization', adminAuthHeader)
                .expect(200);

            expect(response.body).toBeNull();
        });

        it('should fail without authentication', async () => {
            await request(app)
                .get(`/api/users/${testUserId}/profile`)
                .expect(401);
        });

        it('should fail for non-existent user', async () => {
            const response = await request(app)
                .get('/api/users/99999/profile')
                .set('Authorization', adminAuthHeader);

            expect(response.status).toBe(404);
        });
    });

    describe('PATCH /api/users/:id/profile', () => {
        it('should create profile with all EMA fields', async () => {
            const profileData = {
                firstNameEn: 'John',
                lastNameEn: 'Doe',
                emaNumber: '11990133',
                hideProfile: false
            };

            const response = await request(app)
                .patch(`/api/users/${testUserId}/profile`)
                .set('Authorization', adminAuthHeader)
                .send(profileData)
                .expect(200);

            expect(response.body.userId).toBe(testUserId);
            expect(response.body.firstNameEn).toBe('John');
            expect(response.body.lastNameEn).toBe('Doe');
            expect(response.body.emaNumber).toBe('11990133');
            expect(response.body.hideProfile).toBe(false);
        });

        it('should return profile via GET after creation', async () => {
            const response = await request(app)
                .get(`/api/users/${testUserId}/profile`)
                .set('Authorization', adminAuthHeader)
                .expect(200);

            expect(response.body.userId).toBe(testUserId);
            expect(response.body.firstNameEn).toBe('John');
            expect(response.body.lastNameEn).toBe('Doe');
            expect(response.body.emaNumber).toBe('11990133');
        });

        it('should partially update profile (only hideProfile)', async () => {
            const response = await request(app)
                .patch(`/api/users/${testUserId}/profile`)
                .set('Authorization', adminAuthHeader)
                .send({ hideProfile: true })
                .expect(200);

            expect(response.body.hideProfile).toBe(true);
            expect(response.body.firstNameEn).toBe('John');
            expect(response.body.lastNameEn).toBe('Doe');
            expect(response.body.emaNumber).toBe('11990133');
        });

        it('should partially update profile (only name fields)', async () => {
            const response = await request(app)
                .patch(`/api/users/${testUserId}/profile`)
                .set('Authorization', adminAuthHeader)
                .send({ firstNameEn: 'Jane', lastNameEn: 'Smith' })
                .expect(200);

            expect(response.body.firstNameEn).toBe('Jane');
            expect(response.body.lastNameEn).toBe('Smith');
            expect(response.body.hideProfile).toBe(true);
            expect(response.body.emaNumber).toBe('11990133');
        });

        it('should clear fields when set to null', async () => {
            const response = await request(app)
                .patch(`/api/users/${testUserId}/profile`)
                .set('Authorization', adminAuthHeader)
                .send({ emaNumber: null })
                .expect(200);

            expect(response.body.emaNumber).toBeNull();
            expect(response.body.firstNameEn).toBe('Jane');
        });

        it('should fail when non-admin tries to update profile', async () => {
            const response = await request(app)
                .patch(`/api/users/${testUserId}/profile`)
                .set('Authorization', regularUserAuthHeader)
                .send({ firstNameEn: 'Hacker' });

            expect(response.status).toBe(403);
        });

        it('should fail without authentication', async () => {
            await request(app)
                .patch(`/api/users/${testUserId}/profile`)
                .send({ firstNameEn: 'Hacker' })
                .expect(401);
        });

        it('should fail for non-existent user', async () => {
            const response = await request(app)
                .patch('/api/users/99999/profile')
                .set('Authorization', adminAuthHeader)
                .send({ firstNameEn: 'Ghost' });

            expect(response.status).toBe(404);
        });

        it('should fail when emaNumber contains non-digits', async () => {
            const response = await request(app)
                .patch(`/api/users/${testUserId}/profile`)
                .set('Authorization', adminAuthHeader)
                .send({ emaNumber: 'ABC123' });

            expect(response.status).toBe(400);
        });

        it('should enforce unique emaNumber across users', async () => {
            // Set emaNumber on user 1
            await request(app)
                .patch(`/api/users/${testUserId}/profile`)
                .set('Authorization', adminAuthHeader)
                .send({ emaNumber: '99990001' })
                .expect(200);

            // Try to set the same emaNumber on user 2
            const response = await request(app)
                .patch(`/api/users/${testUser2Id}/profile`)
                .set('Authorization', adminAuthHeader)
                .send({ emaNumber: '99990001' });

            expect(response.status).toBe(500);
        });
    });

    describe('Profile in User responses', () => {
        it('should include profile in GET /api/users/:id response', async () => {
            const response = await request(app)
                .get(`/api/users/${testUserId}`)
                .set('Authorization', adminAuthHeader)
                .expect(200);

            expect(response.body.profile).not.toBeNull();
            expect(response.body.profile.userId).toBe(testUserId);
            expect(response.body.profile.firstNameEn).toBe('Jane');
        });

        it('should include null profile for user without profile', async () => {
            const response = await request(app)
                .get(`/api/users/${testUser2Id}`)
                .set('Authorization', adminAuthHeader)
                .expect(200);

            expect(response.body.profile).toBeNull();
        });

        it('should include profile in GET /api/users list response', async () => {
            const response = await request(app)
                .get('/api/users')
                .set('Authorization', adminAuthHeader)
                .expect(200);

            const userWithProfile = response.body.find((u: any) => u.id === testUserId);
            const userWithoutProfile = response.body.find((u: any) => u.id === testUser2Id);

            expect(userWithProfile.profile).not.toBeNull();
            expect(userWithProfile.profile.firstNameEn).toBe('Jane');
            expect(userWithoutProfile.profile).toBeNull();
        });
    });
});
