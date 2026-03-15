import { ClubRepository } from '../src/repository/ClubRepository.ts';
import { MembershipRepository } from '../src/repository/MembershipRepository.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';

const SYSTEM_USER_ID = 0;
const TEST_USER_A_ID = 91001;
const TEST_USER_B_ID = 91002;

function seedTestUsers(): void {
    const timestamp = new Date().toISOString();

    dbManager.db.prepare(`
        INSERT INTO user (id, name, telegramUsername, telegramId, createdAt, modifiedAt, modifiedBy, isActive, isAdmin, status)
        VALUES (:id, :name, :telegramUsername, :telegramId, :createdAt, :modifiedAt, :modifiedBy, :isActive, :isAdmin, :status)
    `).run({
        id: TEST_USER_A_ID,
        name: 'Repo Test User A',
        telegramUsername: '@repo_test_user_a',
        telegramId: 910010001,
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
        id: TEST_USER_B_ID,
        name: 'Repo Test User B',
        telegramUsername: '@repo_test_user_b',
        telegramId: 910020001,
        createdAt: timestamp,
        modifiedAt: timestamp,
        modifiedBy: SYSTEM_USER_ID,
        isActive: 1,
        isAdmin: 0,
        status: 'ACTIVE'
    });
}

function cleanupRepositoryData(): void {
    dbManager.db.prepare('DELETE FROM clubMembership WHERE userId IN (?, ?)').run(TEST_USER_A_ID, TEST_USER_B_ID);
    dbManager.db.prepare("DELETE FROM club WHERE name LIKE 'Repo Test Club %'").run();
}

function cleanupRepositoryFixtures(): void {
    cleanupRepositoryData();
    dbManager.db.prepare('DELETE FROM user WHERE id IN (?, ?)').run(TEST_USER_A_ID, TEST_USER_B_ID);
}

describe('Club and Membership repositories', () => {
    const clubRepository = new ClubRepository();
    const membershipRepository = new MembershipRepository();

    beforeAll(() => {
        seedTestUsers();
    });

    afterEach(() => {
        cleanupRepositoryData();
    });

    afterAll(() => {
        cleanupRepositoryFixtures();
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    it('ClubRepository creates, reads, updates and deletes a club with proper mapping', () => {
        const createdAt = new Date('2026-03-10T10:00:00.000Z');
        const modifiedAt = new Date('2026-03-10T10:05:00.000Z');

        const clubId = clubRepository.createClub({
            name: 'Repo Test Club Alpha',
            address: 'Main street 1',
            city: 'Kyiv',
            description: 'Repository test club',
            contactInfo: '@repo_club',
            isActive: true,
            ratingChatId: '-10012345',
            ratingTopicId: '77',
            createdAt,
            modifiedAt,
            modifiedBy: SYSTEM_USER_ID
        });

        const byId = clubRepository.findClubById(clubId);
        expect(byId).toBeDefined();
        expect(byId).toMatchObject({
            id: clubId,
            name: 'Repo Test Club Alpha',
            address: 'Main street 1',
            city: 'Kyiv',
            description: 'Repository test club',
            contactInfo: '@repo_club',
            isActive: true,
            ratingChatId: '-10012345',
            ratingTopicId: '77',
            modifiedBy: SYSTEM_USER_ID
        });
        expect(byId!.createdAt).toEqual(createdAt);
        expect(byId!.modifiedAt).toEqual(modifiedAt);

        const byName = clubRepository.findClubByName('Repo Test Club Alpha');
        expect(byName?.id).toBe(clubId);
        expect(clubRepository.clubExists(clubId)).toBe(true);

        clubRepository.updateClub({
            id: clubId,
            name: 'Repo Test Club Alpha Updated',
            address: null,
            city: 'Lviv',
            description: null,
            contactInfo: 'updated-contact',
            isActive: false,
            ratingChatId: null,
            ratingTopicId: null,
            modifiedAt: new Date('2026-03-10T11:00:00.000Z'),
            modifiedBy: TEST_USER_A_ID
        });

        const updated = clubRepository.findClubById(clubId);
        expect(updated).toBeDefined();
        expect(updated).toMatchObject({
            id: clubId,
            name: 'Repo Test Club Alpha Updated',
            address: null,
            city: 'Lviv',
            description: null,
            contactInfo: 'updated-contact',
            isActive: false,
            ratingChatId: null,
            ratingTopicId: null,
            modifiedBy: TEST_USER_A_ID
        });

        const allClubs = clubRepository.findAllClubs();
        expect(allClubs.some(club => club.id === clubId)).toBe(true);

        clubRepository.deleteClub(clubId);
        expect(clubRepository.findClubById(clubId)).toBeUndefined();
        expect(clubRepository.clubExists(clubId)).toBe(false);
    });

    it('MembershipRepository creates, filters, updates and deletes membership rows', () => {
        const clubId = clubRepository.createClub({
            name: 'Repo Test Club Membership',
            address: null,
            city: null,
            description: null,
            contactInfo: null,
            isActive: true,
            ratingChatId: null,
            ratingTopicId: null,
            createdAt: new Date('2026-03-11T10:00:00.000Z'),
            modifiedAt: new Date('2026-03-11T10:00:00.000Z'),
            modifiedBy: SYSTEM_USER_ID
        });

        membershipRepository.createMembership({
            clubId,
            userId: TEST_USER_A_ID,
            role: 'MEMBER',
            status: 'PENDING',
            createdAt: new Date('2026-03-11T11:00:00.000Z'),
            modifiedAt: new Date('2026-03-11T11:00:00.000Z'),
            modifiedBy: SYSTEM_USER_ID
        });

        membershipRepository.createMembership({
            clubId,
            userId: TEST_USER_B_ID,
            role: 'MEMBER',
            status: 'PENDING',
            createdAt: new Date('2026-03-11T12:00:00.000Z'),
            modifiedAt: new Date('2026-03-11T12:00:00.000Z'),
            modifiedBy: SYSTEM_USER_ID
        });

        const allMembers = membershipRepository.findMembersByClubId(clubId);
        expect(allMembers.map(member => member.userId)).toEqual([TEST_USER_A_ID, TEST_USER_B_ID]);

        const pendingMembers = membershipRepository.findPendingMembersByClubId(clubId);
        expect(pendingMembers).toHaveLength(2);

        expect(membershipRepository.getUserClubRole(clubId, TEST_USER_A_ID)).toBeUndefined();

        membershipRepository.updateMembershipRole(clubId, TEST_USER_A_ID, 'MODERATOR', TEST_USER_B_ID);
        membershipRepository.updateMembershipStatus(clubId, TEST_USER_A_ID, 'ACTIVE', TEST_USER_B_ID);

        const updated = membershipRepository.findMembership(clubId, TEST_USER_A_ID);
        expect(updated).toBeDefined();
        expect(updated).toMatchObject({
            clubId,
            userId: TEST_USER_A_ID,
            role: 'MODERATOR',
            status: 'ACTIVE',
            modifiedBy: TEST_USER_B_ID
        });

        expect(membershipRepository.getUserClubRole(clubId, TEST_USER_A_ID)).toBe('MODERATOR');

        membershipRepository.deleteMembership(clubId, TEST_USER_A_ID);
        expect(membershipRepository.findMembership(clubId, TEST_USER_A_ID)).toBeUndefined();
    });
});
