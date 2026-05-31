import { dbManager } from '../src/db/dbInit.ts';
import { ClubService } from '../src/service/ClubService.ts';
import { ClubFollowService } from '../src/service/ClubFollowService.ts';
import { ClubMembershipService } from '../src/service/ClubMembershipService.ts';
import { ClubFollowRepository } from '../src/repository/ClubFollowRepository.ts';
import { ClubNotFoundError } from '../src/error/ClubErrors.ts';
import { cleanupTestDatabase } from './setup.ts';

const SYSTEM_USER_ID = 0;
const FOLLOW_TEST_USER_ID = 96101;

const clubService = new ClubService();
const followService = new ClubFollowService();
const membershipService = new ClubMembershipService();
const followRepository = new ClubFollowRepository();

let clubSequence = 0;

function seedTestUser(): void {
    const timestamp = new Date().toISOString();
    dbManager.db.prepare(`
        INSERT INTO user (id, name, telegramUsername, telegramId, createdAt, modifiedAt, modifiedBy, isActive, isAdmin, status)
        VALUES (:id, :name, :telegramUsername, :telegramId, :createdAt, :modifiedAt, :modifiedBy, :isActive, :isAdmin, :status)
    `).run({
        id: FOLLOW_TEST_USER_ID,
        name: 'Follow Service Test User',
        telegramUsername: '@follow_service_test_user',
        telegramId: 961010001,
        createdAt: timestamp,
        modifiedAt: timestamp,
        modifiedBy: SYSTEM_USER_ID,
        isActive: 1,
        isAdmin: 0,
        status: 'ACTIVE'
    });
}

function cleanupFollowData(): void {
    dbManager.db.prepare('DELETE FROM clubFollow WHERE clubId IN (SELECT id FROM club WHERE name LIKE ?)').run('Follow Service Club %');
    dbManager.db.prepare('DELETE FROM clubMembership WHERE clubId IN (SELECT id FROM club WHERE name LIKE ?)').run('Follow Service Club %');
    dbManager.db.prepare('DELETE FROM club WHERE name LIKE ?').run('Follow Service Club %');
}

function createClub(): number {
    clubSequence += 1;
    const club = clubService.createClub({
        name: `Follow Service Club ${clubSequence}`,
        address: null,
        city: null,
        description: null,
        contactInfo: null,
        isActive: true
    }, SYSTEM_USER_ID);
    return club.id;
}

beforeAll(() => {
    seedTestUser();
});

afterEach(() => {
    cleanupFollowData();
});

afterAll(() => {
    cleanupFollowData();
    dbManager.db.prepare('DELETE FROM user WHERE id = ?').run(FOLLOW_TEST_USER_ID);
    dbManager.closeDB();
    cleanupTestDatabase();
});

describe('ClubFollowService', () => {
    it('followClub creates a follow', () => {
        const clubId = createClub();

        followService.followClub(clubId, FOLLOW_TEST_USER_ID);

        expect(followRepository.findFollow(clubId, FOLLOW_TEST_USER_ID)).toBeDefined();
    });

    it('followClub is idempotent', () => {
        const clubId = createClub();

        followService.followClub(clubId, FOLLOW_TEST_USER_ID);
        followService.followClub(clubId, FOLLOW_TEST_USER_ID);

        const followed = followService.getFollowedClubsForUser(FOLLOW_TEST_USER_ID);
        expect(followed.filter(club => club.id === clubId)).toHaveLength(1);
    });

    it('followClub throws ClubNotFoundError for unknown club', () => {
        expect(() => followService.followClub(999999, FOLLOW_TEST_USER_ID)).toThrow(ClubNotFoundError);
    });

    it('unfollowClub removes a follow', () => {
        const clubId = createClub();
        followService.followClub(clubId, FOLLOW_TEST_USER_ID);

        followService.unfollowClub(clubId, FOLLOW_TEST_USER_ID);

        expect(followRepository.findFollow(clubId, FOLLOW_TEST_USER_ID)).toBeUndefined();
    });

    it('getFollowedClubsForUser returns the union of followed and active-member clubs, deduped', () => {
        const followOnlyClubId = createClub();
        const memberOnlyClubId = createClub();
        const bothClubId = createClub();

        followService.followClub(followOnlyClubId, FOLLOW_TEST_USER_ID);

        membershipService.requestJoin(memberOnlyClubId, FOLLOW_TEST_USER_ID, SYSTEM_USER_ID);
        membershipService.activateMember(memberOnlyClubId, FOLLOW_TEST_USER_ID, SYSTEM_USER_ID);
        // activateMember auto-follows; unfollow so this club is member-only (still expected via union)
        followService.unfollowClub(memberOnlyClubId, FOLLOW_TEST_USER_ID);

        followService.followClub(bothClubId, FOLLOW_TEST_USER_ID);
        membershipService.requestJoin(bothClubId, FOLLOW_TEST_USER_ID, SYSTEM_USER_ID);
        membershipService.activateMember(bothClubId, FOLLOW_TEST_USER_ID, SYSTEM_USER_ID);

        const ids = followService.getFollowedClubsForUser(FOLLOW_TEST_USER_ID).map(club => club.id);

        expect(ids).toContain(followOnlyClubId);
        expect(ids).toContain(memberOnlyClubId);
        expect(ids).toContain(bothClubId);
        expect(ids.filter(id => id === bothClubId)).toHaveLength(1);
    });

    it('activateMember auto-follows the club', () => {
        const clubId = createClub();

        membershipService.requestJoin(clubId, FOLLOW_TEST_USER_ID, SYSTEM_USER_ID);
        membershipService.activateMember(clubId, FOLLOW_TEST_USER_ID, SYSTEM_USER_ID);

        expect(followRepository.findFollow(clubId, FOLLOW_TEST_USER_ID)).toBeDefined();
    });
});
