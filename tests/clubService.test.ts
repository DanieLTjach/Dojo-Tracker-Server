import type { NextFunction, Request, Response } from 'express';
import { jest } from '@jest/globals';
import { dbManager } from '../src/db/dbInit.ts';
import { requireClubRole } from '../src/middleware/ClubRoleMiddleware.ts';
import { MembershipRepository } from '../src/repository/MembershipRepository.ts';
import { ClubService } from '../src/service/ClubService.ts';
import { MembershipService } from '../src/service/MembershipService.ts';
import {
    ClubNameAlreadyExistsError,
    ClubNotFoundError,
    ClubMembershipAlreadyExistsError,
    InsufficientClubPermissionsError,
    InvalidClubMembershipStateError
} from '../src/error/ClubErrors.ts';
import { cleanupTestDatabase } from './setup.ts';

const SYSTEM_USER_ID = 0;
const SERVICE_TEST_USER_ID = 92001;
const OWNER_TEST_USER_ID = 92002;
const MEMBER_TEST_USER_ID = 92003;
const ADMIN_TEST_USER_ID = 92004;

const clubService = new ClubService();
const membershipService = new MembershipService();
const membershipRepository = new MembershipRepository();

let clubSequence = 0;

function seedServiceTestUsers(): void {
    const timestamp = new Date().toISOString();

    dbManager.db.prepare(`
        INSERT INTO user (id, name, telegramUsername, telegramId, createdAt, modifiedAt, modifiedBy, isActive, isAdmin, status)
        VALUES (:id, :name, :telegramUsername, :telegramId, :createdAt, :modifiedAt, :modifiedBy, :isActive, :isAdmin, :status)
    `).run({
        id: SERVICE_TEST_USER_ID,
        name: 'Club Service Test User',
        telegramUsername: '@club_service_test_user',
        telegramId: 920010001,
        createdAt: timestamp,
        modifiedAt: timestamp,
        modifiedBy: SYSTEM_USER_ID,
        isActive: 1,
        isAdmin: 0,
        status: 'ACTIVE'
    });

    dbManager.db.prepare(`
        INSERT INTO user (id, name, telegramUsername, telegramId, createdAt, modifiedAt, modifiedBy, isActive, isAdmin, status)
        VALUES (:id, :name, :telegramUsername, :telegramId, :createdAt, :modifiedAt, :modifiedBy, :isActive, :isAdmin, :status)
    `).run({
        id: OWNER_TEST_USER_ID,
        name: 'Club Owner Test User',
        telegramUsername: '@club_owner_test_user',
        telegramId: 920020001,
        createdAt: timestamp,
        modifiedAt: timestamp,
        modifiedBy: SYSTEM_USER_ID,
        isActive: 1,
        isAdmin: 0,
        status: 'ACTIVE'
    });

    dbManager.db.prepare(`
        INSERT INTO user (id, name, telegramUsername, telegramId, createdAt, modifiedAt, modifiedBy, isActive, isAdmin, status)
        VALUES (:id, :name, :telegramUsername, :telegramId, :createdAt, :modifiedAt, :modifiedBy, :isActive, :isAdmin, :status)
    `).run({
        id: MEMBER_TEST_USER_ID,
        name: 'Club Member Test User',
        telegramUsername: '@club_member_test_user',
        telegramId: 920030001,
        createdAt: timestamp,
        modifiedAt: timestamp,
        modifiedBy: SYSTEM_USER_ID,
        isActive: 1,
        isAdmin: 0,
        status: 'ACTIVE'
    });

    dbManager.db.prepare(`
        INSERT INTO user (id, name, telegramUsername, telegramId, createdAt, modifiedAt, modifiedBy, isActive, isAdmin, status)
        VALUES (:id, :name, :telegramUsername, :telegramId, :createdAt, :modifiedAt, :modifiedBy, :isActive, :isAdmin, :status)
    `).run({
        id: ADMIN_TEST_USER_ID,
        name: 'Club Admin Test User',
        telegramUsername: '@club_admin_test_user',
        telegramId: 920040001,
        createdAt: timestamp,
        modifiedAt: timestamp,
        modifiedBy: SYSTEM_USER_ID,
        isActive: 1,
        isAdmin: 1,
        status: 'ACTIVE'
    });
}

function cleanupServiceData(): void {
    dbManager.db.prepare('DELETE FROM clubMembership WHERE clubId IN (SELECT id FROM club WHERE name LIKE ?)').run('Service Test Club %');
    dbManager.db.prepare('DELETE FROM club WHERE name LIKE ?').run('Service Test Club %');
}

function cleanupServiceFixtures(): void {
    cleanupServiceData();
    dbManager.db.prepare('DELETE FROM user WHERE id IN (?, ?, ?, ?)').run(
        SERVICE_TEST_USER_ID,
        OWNER_TEST_USER_ID,
        MEMBER_TEST_USER_ID,
        ADMIN_TEST_USER_ID
    );
}

function createServiceTestClub(): number {
    clubSequence += 1;
    const created = clubService.createClub({
        name: `Service Test Club ${clubSequence}`,
        address: null,
        city: null,
        description: null,
        contactInfo: null,
        isActive: true,
        ratingChatId: null,
        ratingTopicId: null
    }, SYSTEM_USER_ID);
    return created.id;
}

beforeAll(() => {
    seedServiceTestUsers();
});

afterEach(() => {
    cleanupServiceData();
});

afterAll(() => {
    cleanupServiceFixtures();
    dbManager.closeDB();
    cleanupTestDatabase();
});

describe('ClubService and MembershipService', () => {
    describe('ClubService', () => {
        it('createClub returns the created club', () => {
            const club = clubService.createClub({
                name: 'Service Test Club CRUD Create',
                address: 'Test address',
                city: 'Kyiv',
                description: 'A club for service tests',
                contactInfo: '@club_service',
                isActive: true,
                ratingChatId: '-100777',
                ratingTopicId: '17'
            }, SYSTEM_USER_ID);

            expect(club.id).toBeGreaterThan(0);
            expect(club.name).toBe('Service Test Club CRUD Create');
            expect(club.city).toBe('Kyiv');
        });

        it('createClub throws on duplicate name', () => {
            clubService.createClub({
                name: 'Service Test Club Duplicate Name',
                address: null,
                city: null,
                description: null,
                contactInfo: null,
                isActive: true,
                ratingChatId: null,
                ratingTopicId: null
            }, SYSTEM_USER_ID);

            expect(() => {
                clubService.createClub({
                    name: 'Service Test Club Duplicate Name',
                    address: null,
                    city: null,
                    description: null,
                    contactInfo: null,
                    isActive: true,
                    ratingChatId: null,
                    ratingTopicId: null
                }, SYSTEM_USER_ID);
            }).toThrow(ClubNameAlreadyExistsError);
        });

        it('updateClub throws ClubNotFoundError for missing club', () => {
            expect(() => {
                clubService.updateClub(999999, {
                    name: 'Service Test Club Missing',
                    address: null,
                    city: null,
                    description: null,
                    contactInfo: null,
                    isActive: true,
                    ratingChatId: null,
                    ratingTopicId: null
                }, SYSTEM_USER_ID);
            }).toThrow(ClubNotFoundError);
        });

        it('deleteClub throws ClubNotFoundError for missing club', () => {
            expect(() => {
                clubService.deleteClub(999998);
            }).toThrow(ClubNotFoundError);
        });
    });

    describe('MembershipService', () => {
        it('requestJoin creates PENDING MEMBER membership', () => {
            const clubId = createServiceTestClub();

            const membership = membershipService.requestJoin(clubId, SERVICE_TEST_USER_ID, SYSTEM_USER_ID);

            expect(membership.clubId).toBe(clubId);
            expect(membership.userId).toBe(SERVICE_TEST_USER_ID);
            expect(membership.role).toBe('MEMBER');
            expect(membership.status).toBe('PENDING');
        });

        it('requestJoin throws when membership already exists', () => {
            const clubId = createServiceTestClub();
            membershipService.requestJoin(clubId, SERVICE_TEST_USER_ID, SYSTEM_USER_ID);

            expect(() => {
                membershipService.requestJoin(clubId, SERVICE_TEST_USER_ID, SYSTEM_USER_ID);
            }).toThrow(ClubMembershipAlreadyExistsError);
        });

        it('activateMember succeeds when membership is PENDING', () => {
            const clubId = createServiceTestClub();
            membershipService.requestJoin(clubId, SERVICE_TEST_USER_ID, SYSTEM_USER_ID);

            const activatedMembership = membershipService.activateMember(clubId, SERVICE_TEST_USER_ID, SYSTEM_USER_ID);

            expect(activatedMembership.status).toBe('ACTIVE');
        });

        it('activateMember throws InvalidClubMembershipStateError when already ACTIVE', () => {
            const clubId = createServiceTestClub();
            membershipService.requestJoin(clubId, SERVICE_TEST_USER_ID, SYSTEM_USER_ID);
            membershipService.activateMember(clubId, SERVICE_TEST_USER_ID, SYSTEM_USER_ID);

            expect(() => {
                membershipService.activateMember(clubId, SERVICE_TEST_USER_ID, SYSTEM_USER_ID);
            }).toThrow(InvalidClubMembershipStateError);
        });
    });
});

describe('ClubRoleMiddleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
        mockReq = {
            params: {}
        };
        mockRes = {};
        mockNext = jest.fn();
    });

    it('allows admin users to bypass club-role checks', () => {
        const clubId = createServiceTestClub();

        mockReq.user = {
            userId: ADMIN_TEST_USER_ID,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 3600
        };
        mockReq.params = { clubId: String(clubId) };

        requireClubRole('OWNER')(mockReq as Request, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalledWith();
    });

    it('allows OWNER membership for OWNER-required route', () => {
        const clubId = createServiceTestClub();
        const now = new Date();

        membershipRepository.createMembership({
            clubId,
            userId: OWNER_TEST_USER_ID,
            role: 'OWNER',
            status: 'ACTIVE',
            createdAt: now,
            modifiedAt: now,
            modifiedBy: SYSTEM_USER_ID
        });

        mockReq.user = {
            userId: OWNER_TEST_USER_ID,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 3600
        };
        mockReq.params = { clubId: String(clubId) };

        requireClubRole('OWNER')(mockReq as Request, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalledWith();
    });

    it('rejects MEMBER role for OWNER-required route', () => {
        const clubId = createServiceTestClub();
        const now = new Date();

        membershipRepository.createMembership({
            clubId,
            userId: MEMBER_TEST_USER_ID,
            role: 'MEMBER',
            status: 'ACTIVE',
            createdAt: now,
            modifiedAt: now,
            modifiedBy: SYSTEM_USER_ID
        });

        mockReq.user = {
            userId: MEMBER_TEST_USER_ID,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 3600
        };
        mockReq.params = { clubId: String(clubId) };

        requireClubRole('OWNER')(mockReq as Request, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(InsufficientClubPermissionsError));
    });

    it('rejects non-members for OWNER-required route', () => {
        const clubId = createServiceTestClub();

        mockReq.user = {
            userId: SERVICE_TEST_USER_ID,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 3600
        };
        mockReq.params = { clubId: String(clubId) };

        requireClubRole('OWNER')(mockReq as Request, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(InsufficientClubPermissionsError));
    });
});
