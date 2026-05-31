import request from 'supertest';
import express from 'express';
import clubRoutes from '../src/routes/ClubRoutes.ts';
import userRoutes from '../src/routes/UserRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createAuthHeader } from './testHelpers.ts';
import { UserService } from '../src/service/UserService.ts';
import { UserRepository } from '../src/repository/UserRepository.ts';
import { ClubMembershipService } from '../src/service/ClubMembershipService.ts';

const app = express();
app.use(express.json());
app.use('/api/clubs', clubRoutes);
app.use('/api/users', userRoutes);
app.use(handleErrors);

describe('Club Follow API Endpoints', () => {
    const SYSTEM_USER_ID = 0;
    const adminAuthHeader = createAuthHeader(SYSTEM_USER_ID);

    const membershipService = new ClubMembershipService();

    let userId: number;
    let userAuthHeader: string;

    function cleanupClub(clubId: number): void {
        dbManager.db.prepare('DELETE FROM clubFollow WHERE clubId = ?').run(clubId);
        dbManager.db.prepare('DELETE FROM clubMembership WHERE clubId = ?').run(clubId);
        dbManager.db.prepare('DELETE FROM club WHERE id = ?').run(clubId);
    }

    async function createClub(name: string): Promise<number> {
        const response = await request(app)
            .post('/api/clubs')
            .set('Authorization', adminAuthHeader)
            .send({ name });
        return response.body.id;
    }

    beforeAll(() => {
        const userService = new UserService();
        const userRepository = new UserRepository();

        const user = userService.registerUser('FollowApiUser', 'follow_api_user', 962000001, SYSTEM_USER_ID);
        userId = user.id;
        userRepository.updateUserStatus(userId, true, 'ACTIVE', SYSTEM_USER_ID);
        userAuthHeader = createAuthHeader(userId);
    });

    afterAll(() => {
        dbManager.db.prepare('DELETE FROM clubFollow WHERE userId = ?').run(userId);
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    describe('POST/DELETE /api/clubs/:clubId/follow', () => {
        let clubId: number;

        beforeEach(async () => {
            clubId = await createClub('Follow Api Club Toggle');
        });

        afterEach(() => {
            cleanupClub(clubId);
        });

        test('follows then unfollows a club', async () => {
            const followResponse = await request(app)
                .post(`/api/clubs/${clubId}/follow`)
                .set('Authorization', userAuthHeader);
            expect(followResponse.status).toBe(204);

            const afterFollow = await request(app)
                .get('/api/users/current/clubs/followed')
                .set('Authorization', userAuthHeader);
            expect(afterFollow.body.map((club: { id: number }) => club.id)).toContain(clubId);

            const unfollowResponse = await request(app)
                .delete(`/api/clubs/${clubId}/follow`)
                .set('Authorization', userAuthHeader);
            expect(unfollowResponse.status).toBe(204);

            const afterUnfollow = await request(app)
                .get('/api/users/current/clubs/followed')
                .set('Authorization', userAuthHeader);
            expect(afterUnfollow.body.map((club: { id: number }) => club.id)).not.toContain(clubId);
        });

        test('requires authentication to follow', async () => {
            const response = await request(app).post(`/api/clubs/${clubId}/follow`);
            expect(response.status).toBe(401);
        });
    });

    describe('GET /api/users/current/clubs/followed', () => {
        test('returns the union of followed and active-member clubs', async () => {
            const followedClubId = await createClub('Follow Api Club Followed');
            const memberClubId = await createClub('Follow Api Club Member');

            try {
                await request(app)
                    .post(`/api/clubs/${followedClubId}/follow`)
                    .set('Authorization', userAuthHeader);

                await request(app)
                    .post(`/api/clubs/${memberClubId}/join`)
                    .set('Authorization', userAuthHeader);
                membershipService.activateMember(memberClubId, userId, SYSTEM_USER_ID);
                // unfollow the auto-followed membership so it is member-only
                await request(app)
                    .delete(`/api/clubs/${memberClubId}/follow`)
                    .set('Authorization', userAuthHeader);

                const response = await request(app)
                    .get('/api/users/current/clubs/followed')
                    .set('Authorization', userAuthHeader);

                expect(response.status).toBe(200);
                const ids = response.body.map((club: { id: number }) => club.id);
                expect(ids).toContain(followedClubId);
                expect(ids).toContain(memberClubId);
            } finally {
                cleanupClub(followedClubId);
                cleanupClub(memberClubId);
            }
        });

        test('requires authentication', async () => {
            const response = await request(app).get('/api/users/current/clubs/followed');
            expect(response.status).toBe(401);
        });
    });
});
