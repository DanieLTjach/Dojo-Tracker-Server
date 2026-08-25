import request from 'supertest';
import express from 'express';
import userRoutes from '../src/routes/UserRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { createAuthHeader, createTelegramInitData, resetTestDatabase } from './testHelpers.ts';
import { applyBirthYearVisibility } from '../src/service/ProfileService.ts';
import type { Profile } from '../src/model/ProfileModels.ts';

const app = express();
app.use(express.json());
app.use('/api/users', userRoutes);
app.use(handleErrors);

describe('Profile visibility unit & integration tests', () => {
    describe('applyBirthYearVisibility unit tests', () => {
        const sampleProfile: Profile = {
            userId: 42,
            firstNameEn: null,
            lastNameEn: null,
            firstName: 'Taro',
            lastName: 'Yamada',
            emaNumber: null,
            locale: null,
            hideProfile: false,
            avatarUrl: null,
            statusLine: null,
            birthDay: 15,
            birthMonth: 3,
            birthYear: 1988,
            hideBirthYear: true,
            city: 'Tokyo',
            favouriteYaku: null,
            favouriteTile: null,
            discord: null,
            majsoulAccount: null,
            tenhouAccount: null,
        };

        test('owner sees the year even when hideBirthYear is true', () => {
            const result = applyBirthYearVisibility(sampleProfile, 42, false);
            expect(result.birthYear).toBe(1988);
            expect(result.birthDay).toBe(15);
            expect(result.birthMonth).toBe(3);
        });

        test('admin sees the year even when hideBirthYear is true', () => {
            const result = applyBirthYearVisibility(sampleProfile, 999, true);
            expect(result.birthYear).toBe(1988);
            expect(result.birthDay).toBe(15);
            expect(result.birthMonth).toBe(3);
        });

        test('another non-admin user gets birthYear: null but keeps birthDay and birthMonth', () => {
            const result = applyBirthYearVisibility(sampleProfile, 999, false);
            expect(result.birthYear).toBeNull();
            expect(result.birthDay).toBe(15);
            expect(result.birthMonth).toBe(3);
        });

        test('unauthenticated requester gets birthYear: null when hideBirthYear is true', () => {
            const result = applyBirthYearVisibility(sampleProfile, undefined, false);
            expect(result.birthYear).toBeNull();
            expect(result.birthDay).toBe(15);
            expect(result.birthMonth).toBe(3);
        });

        test('everyone sees birthYear when hideBirthYear is false', () => {
            const publicProfile: Profile = { ...sampleProfile, hideBirthYear: false };
            const result = applyBirthYearVisibility(publicProfile, 999, false);
            expect(result.birthYear).toBe(1988);
        });
    });

    describe('Integration with User API', () => {
        const SYSTEM_USER_ID = 0;
        const adminAuthHeader = createAuthHeader(SYSTEM_USER_ID);

        let user1Id: number;
        let user2Id: number;
        let user1AuthHeader: string;
        let user2AuthHeader: string;

        beforeAll(async () => {
            const initData1 = createTelegramInitData(300100100, 'visuser1');
            const res1 = await request(app)
                .post('/api/users')
                .query(initData1)
                .send({ name: 'Visibility User 1' })
                .expect(201);
            user1Id = res1.body.id;
            await request(app)
                .post(`/api/users/${user1Id}/activate`)
                .set('Authorization', adminAuthHeader)
                .send({});
            user1AuthHeader = createAuthHeader(user1Id);

            const initData2 = createTelegramInitData(300200200, 'visuser2');
            const res2 = await request(app)
                .post('/api/users')
                .query(initData2)
                .send({ name: 'Visibility User 2' })
                .expect(201);
            user2Id = res2.body.id;
            await request(app)
                .post(`/api/users/${user2Id}/activate`)
                .set('Authorization', adminAuthHeader)
                .send({});
            user2AuthHeader = createAuthHeader(user2Id);

            // Set profile on User 1 with birthday and hideBirthYear = true
            await request(app)
                .patch(`/api/users/${user1Id}/profile`)
                .set('Authorization', user1AuthHeader)
                .send({
                    birthDay: 10,
                    birthMonth: 6,
                    birthYear: 1992,
                    hideBirthYear: true,
                    hideProfile: false,
                })
                .expect(200);
        });

        afterAll(() => {
            resetTestDatabase();
        });

        test('owner sees full birthday with year', async () => {
            const res = await request(app)
                .get(`/api/users/${user1Id}`)
                .set('Authorization', user1AuthHeader)
                .expect(200);

            expect(res.body.profile).not.toBeNull();
            expect(res.body.profile.birthDay).toBe(10);
            expect(res.body.profile.birthMonth).toBe(6);
            expect(res.body.profile.birthYear).toBe(1992);
        });

        test('admin sees full birthday with year', async () => {
            const res = await request(app)
                .get(`/api/users/${user1Id}`)
                .set('Authorization', adminAuthHeader)
                .expect(200);

            expect(res.body.profile).not.toBeNull();
            expect(res.body.profile.birthDay).toBe(10);
            expect(res.body.profile.birthMonth).toBe(6);
            expect(res.body.profile.birthYear).toBe(1992);
        });

        test('another user gets birthYear: null but day and month are intact', async () => {
            const res = await request(app)
                .get(`/api/users/${user1Id}`)
                .set('Authorization', user2AuthHeader)
                .expect(200);

            expect(res.body.profile).not.toBeNull();
            expect(res.body.profile.birthDay).toBe(10);
            expect(res.body.profile.birthMonth).toBe(6);
            expect(res.body.profile.birthYear).toBeNull();
        });

        test('hideProfile: true still nulls the entire profile (regression)', async () => {
            await request(app)
                .patch(`/api/users/${user1Id}/profile`)
                .set('Authorization', user1AuthHeader)
                .send({ hideProfile: true })
                .expect(200);

            const res = await request(app)
                .get(`/api/users/${user1Id}`)
                .set('Authorization', user2AuthHeader)
                .expect(200);

            expect(res.body.profile).toBeNull();
        });
    });
});
