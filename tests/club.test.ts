import request from 'supertest';
import express from 'express';
import clubRoutes from '../src/routes/ClubRoutes.ts';
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
app.use(handleErrors);

describe('Club API Endpoints', () => {
    const SYSTEM_USER_ID = 0;

    const adminAuthHeader = createAuthHeader(SYSTEM_USER_ID);
    let nonAdminAuthHeader: string;
    let ownerAuthHeader: string;
    let memberAuthHeader: string;

    let nonAdminId: number;
    let ownerId: number;
    let memberId: number;

    const membershipService = new ClubMembershipService();

    function cleanupClub(clubId: number): void {
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

    async function setupOwner(clubId: number): Promise<void> {
        await request(app)
            .post(`/api/clubs/${clubId}/join`)
            .set('Authorization', ownerAuthHeader);

        membershipService.activateMember(clubId, ownerId, SYSTEM_USER_ID);
        membershipService.updateMemberRole(clubId, ownerId, 'OWNER', SYSTEM_USER_ID);
    }

    beforeAll(() => {
        const userService = new UserService();
        const userRepository = new UserRepository();

        const nonAdminUser = userService.registerUser('NonAdminClubUser', 'nonadmin_club', 666666661, SYSTEM_USER_ID);
        const ownerUser = userService.registerUser('OwnerClubUser', 'owner_club', 666666662, SYSTEM_USER_ID);
        const memberUser = userService.registerUser('MemberClubUser', 'member_club', 666666663, SYSTEM_USER_ID);

        nonAdminId = nonAdminUser.id;
        ownerId = ownerUser.id;
        memberId = memberUser.id;

        userRepository.updateUserStatus(nonAdminId, true, 'ACTIVE', SYSTEM_USER_ID);
        userRepository.updateUserStatus(ownerId, true, 'ACTIVE', SYSTEM_USER_ID);
        userRepository.updateUserStatus(memberId, true, 'ACTIVE', SYSTEM_USER_ID);

        nonAdminAuthHeader = createAuthHeader(nonAdminId);
        ownerAuthHeader = createAuthHeader(ownerId);
        memberAuthHeader = createAuthHeader(memberId);
    });

    afterAll(() => {
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    describe('GET /api/clubs - Get All Clubs', () => {
        test('should return array of clubs for authenticated user', async () => {
            const response = await request(app).get('/api/clubs').set('Authorization', adminAuthHeader);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
        });

        test('should require authentication', async () => {
            const response = await request(app).get('/api/clubs');
            expect(response.status).toBe(401);
        });
    });

    describe('POST /api/clubs - Create Club (admin only)', () => {
        let createdClubId: number | undefined;

        afterEach(() => {
            if (createdClubId) {
                cleanupClub(createdClubId);
                createdClubId = undefined;
            }
        });

        test('should create club when admin and body valid', async () => {
            const response = await request(app)
                .post('/api/clubs')
                .set('Authorization', adminAuthHeader)
                .send({
                    name: 'Integration Club Create',
                    description: 'Created in tests',
                    city: 'Kyiv'
                });

            createdClubId = response.body.id;

            expect(response.status).toBe(201);
            expect(typeof response.body.id).toBe('number');
            expect(response.body.name).toBe('Integration Club Create');
            expect(response.body.city).toBe('Kyiv');
        });

        test('should reject when not admin', async () => {
            const response = await request(app)
                .post('/api/clubs')
                .set('Authorization', nonAdminAuthHeader)
                .send({ name: 'Non Admin Club' });

            expect(response.status).toBe(403);
        });

        test('should validate body and return 400 for invalid payload', async () => {
            const response = await request(app)
                .post('/api/clubs')
                .set('Authorization', adminAuthHeader)
                .send({});

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
            expect(response.body).toHaveProperty('details');
        });
    });

    describe('GET /api/clubs/:clubId - Get Club by ID', () => {
        let clubId: number;

        beforeEach(async () => {
            clubId = await createClub('Integration Club GetById');
        });

        afterEach(() => {
            cleanupClub(clubId);
        });

        test('should return club by id', async () => {
            const response = await request(app)
                .get(`/api/clubs/${clubId}`)
                .set('Authorization', adminAuthHeader);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('id', clubId);
            expect(response.body).toHaveProperty('name', 'Integration Club GetById');
        });

        test('should return 404 for missing club', async () => {
            const response = await request(app)
                .get('/api/clubs/99999')
                .set('Authorization', adminAuthHeader);

            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('message');
            expect(response.body).toHaveProperty('errorCode');
        });
    });

    describe('GET /api/clubs/:clubId/status - Get current user club status', () => {
        let clubId: number;

        beforeEach(async () => {
            clubId = await createClub('Integration Club Status');
        });

        afterEach(() => {
            cleanupClub(clubId);
        });

        test('should return NONE for user without membership', async () => {
            const response = await request(app)
                .get(`/api/clubs/${clubId}/status`)
                .set('Authorization', nonAdminAuthHeader);

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                status: 'NONE',
                role: null,
                permissions: {
                    canJoin: true,
                    canLeave: false,
                    canEditClub: false,
                    canManageMembers: false
                }
            });
        });

        test('should return PENDING with leave enabled for pending member', async () => {
            await request(app)
                .post(`/api/clubs/${clubId}/join`)
                .set('Authorization', memberAuthHeader);

            const response = await request(app)
                .get(`/api/clubs/${clubId}/status`)
                .set('Authorization', memberAuthHeader);

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                status: 'PENDING',
                role: 'MEMBER',
                permissions: {
                    canJoin: false,
                    canLeave: true,
                    canEditClub: false,
                    canManageMembers: false
                }
            });
        });

        test('should return ACTIVE owner permissions', async () => {
            await setupOwner(clubId);

            const response = await request(app)
                .get(`/api/clubs/${clubId}/status`)
                .set('Authorization', ownerAuthHeader);

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                status: 'ACTIVE',
                role: 'OWNER',
                permissions: {
                    canJoin: false,
                    canLeave: true,
                    canEditClub: true,
                    canManageMembers: true
                }
            });
        });

        test('should return ACTIVE moderator permissions', async () => {
            await request(app)
                .post(`/api/clubs/${clubId}/join`)
                .set('Authorization', nonAdminAuthHeader);
            membershipService.activateMember(clubId, nonAdminId, SYSTEM_USER_ID);
            membershipService.updateMemberRole(clubId, nonAdminId, 'MODERATOR', SYSTEM_USER_ID);

            const response = await request(app)
                .get(`/api/clubs/${clubId}/status`)
                .set('Authorization', nonAdminAuthHeader);

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                status: 'ACTIVE',
                role: 'MODERATOR',
                permissions: {
                    canJoin: false,
                    canLeave: true,
                    canEditClub: false,
                    canManageMembers: true
                }
            });
        });

        test('should return ACTIVE member permissions', async () => {
            await request(app)
                .post(`/api/clubs/${clubId}/join`)
                .set('Authorization', memberAuthHeader);
            membershipService.activateMember(clubId, memberId, SYSTEM_USER_ID);

            const response = await request(app)
                .get(`/api/clubs/${clubId}/status`)
                .set('Authorization', memberAuthHeader);

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                status: 'ACTIVE',
                role: 'MEMBER',
                permissions: {
                    canJoin: false,
                    canLeave: true,
                    canEditClub: false,
                    canManageMembers: false
                }
            });
        });

        test('should return INACTIVE with rejoin enabled', async () => {
            await request(app)
                .post(`/api/clubs/${clubId}/join`)
                .set('Authorization', memberAuthHeader);
            membershipService.activateMember(clubId, memberId, SYSTEM_USER_ID);
            await request(app)
                .post(`/api/clubs/${clubId}/leave`)
                .set('Authorization', memberAuthHeader);

            const response = await request(app)
                .get(`/api/clubs/${clubId}/status`)
                .set('Authorization', memberAuthHeader);

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                status: 'INACTIVE',
                role: 'MEMBER',
                permissions: {
                    canJoin: true,
                    canLeave: false,
                    canEditClub: false,
                    canManageMembers: false
                }
            });
        });

        test('should return admin management permissions even without membership', async () => {
            const response = await request(app)
                .get(`/api/clubs/${clubId}/status`)
                .set('Authorization', adminAuthHeader);

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                status: 'NONE',
                role: null,
                permissions: {
                    canJoin: true,
                    canLeave: false,
                    canEditClub: true,
                    canManageMembers: true
                }
            });
        });
    });

    describe('PUT /api/clubs/:clubId - Update Club (admin only)', () => {
        let clubId: number;

        beforeEach(async () => {
            clubId = await createClub('Integration Club Update Source');
        });

        afterEach(() => {
            cleanupClub(clubId);
        });

        test('should update club when admin', async () => {
            const response = await request(app)
                .put(`/api/clubs/${clubId}`)
                .set('Authorization', adminAuthHeader)
                .send({
                    name: 'Integration Club Updated',
                    address: 'Main st 1',
                    city: 'Lviv',
                    description: 'Updated',
                    contactInfo: '+380...',
                    isActive: true,
                    ratingChatId: null,
                    ratingTopicId: null
                });

            expect(response.status).toBe(200);
            expect(response.body.name).toBe('Integration Club Updated');
            expect(response.body.city).toBe('Lviv');
        });

        test('should reject when not admin', async () => {
            const response = await request(app)
                .put(`/api/clubs/${clubId}`)
                .set('Authorization', nonAdminAuthHeader)
                .send({ name: 'Not Allowed Update' });

            expect(response.status).toBe(403);
        });
    });

    describe('DELETE /api/clubs/:clubId - Delete Club (admin only)', () => {
        test('should delete club and return 204', async () => {
            const clubId = await createClub('Integration Club Delete');

            const deleteResponse = await request(app)
                .delete(`/api/clubs/${clubId}`)
                .set('Authorization', adminAuthHeader);

            expect(deleteResponse.status).toBe(204);

            const getResponse = await request(app)
                .get(`/api/clubs/${clubId}`)
                .set('Authorization', adminAuthHeader);

            expect(getResponse.status).toBe(404);
        });
    });

    describe('Membership endpoints', () => {
        describe('POST /api/clubs/:clubId/join - Request Join', () => {
            let clubId: number;

            beforeEach(async () => {
                clubId = await createClub('Integration Club Join');
            });

            afterEach(() => {
                cleanupClub(clubId);
            });

            test('should create pending membership for authenticated user', async () => {
                const response = await request(app)
                    .post(`/api/clubs/${clubId}/join`)
                    .set('Authorization', memberAuthHeader);

                expect(response.status).toBe(201);
                expect(response.body.clubId).toBe(clubId);
                expect(response.body.userId).toBe(memberId);
                expect(response.body.status).toBe('PENDING');
                expect(response.body.role).toBe('MEMBER');
            });
        });

        describe('POST /api/clubs/:clubId/members/:userId/activate - Activate member', () => {
            let clubId: number;

            beforeEach(async () => {
                clubId = await createClub('Integration Club Activate');
                await setupOwner(clubId);
                await request(app)
                    .post(`/api/clubs/${clubId}/join`)
                    .set('Authorization', memberAuthHeader);
            });

            afterEach(() => {
                cleanupClub(clubId);
            });

            test('should allow owner to activate pending member', async () => {
                const response = await request(app)
                    .post(`/api/clubs/${clubId}/members/${memberId}/activate`)
                    .set('Authorization', ownerAuthHeader);

                expect(response.status).toBe(200);
                expect(response.body.userId).toBe(memberId);
                expect(response.body.status).toBe('ACTIVE');
            });

            test('should reject non-owner activate attempt', async () => {
                const response = await request(app)
                    .post(`/api/clubs/${clubId}/members/${memberId}/activate`)
                    .set('Authorization', nonAdminAuthHeader);

                expect(response.status).toBe(403);
            });
        });

        describe('POST /api/clubs/:clubId/leave - Leave club', () => {
            let clubId: number;

            beforeEach(async () => {
                clubId = await createClub('Integration Club Leave');
                await setupOwner(clubId);
                await request(app)
                    .post(`/api/clubs/${clubId}/join`)
                    .set('Authorization', memberAuthHeader);
                membershipService.activateMember(clubId, memberId, 0);
            });

            afterEach(() => {
                cleanupClub(clubId);
            });

            test('should allow active member to leave club', async () => {
                const response = await request(app)
                    .post(`/api/clubs/${clubId}/leave`)
                    .set('Authorization', memberAuthHeader);

                expect(response.status).toBe(200);
                expect(response.body.userId).toBe(memberId);
                expect(response.body.status).toBe('INACTIVE');
            });

            test('should reject unauthenticated leave attempt', async () => {
                const response = await request(app)
                    .post(`/api/clubs/${clubId}/leave`);

                expect(response.status).toBe(401);
            });
        });

        describe('GET /api/clubs/:clubId/members - Get members list', () => {
            let clubId: number;

            beforeEach(async () => {
                clubId = await createClub('Integration Club Members List');
                await setupOwner(clubId);
                await request(app)
                    .post(`/api/clubs/${clubId}/join`)
                    .set('Authorization', memberAuthHeader);
            });

            afterEach(() => {
                cleanupClub(clubId);
            });

            test('should return members list', async () => {
                const response = await request(app)
                    .get(`/api/clubs/${clubId}/members`)
                    .set('Authorization', ownerAuthHeader);

                expect(response.status).toBe(200);
                expect(Array.isArray(response.body)).toBe(true);
                expect(response.body.some((membership: { userId: number; role: string }) => membership.userId === ownerId && membership.role === 'OWNER')).toBe(true);
                expect(response.body.some((membership: { userId: number; status: string }) => membership.userId === memberId && membership.status === 'PENDING')).toBe(true);
            });
        });
    });
});
