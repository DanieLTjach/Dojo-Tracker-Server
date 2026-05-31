import { ClubRepository } from '../src/repository/ClubRepository.ts';
import { ClubFollowRepository } from '../src/repository/ClubFollowRepository.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';

const SYSTEM_USER_ID = 0;
const TEST_USER_ID = 96001;

function seedTestUser(): void {
    const timestamp = new Date().toISOString();
    dbManager.db.prepare(`
        INSERT INTO user (id, name, telegramUsername, telegramId, createdAt, modifiedAt, modifiedBy, isActive, isAdmin, status)
        VALUES (:id, :name, :telegramUsername, :telegramId, :createdAt, :modifiedAt, :modifiedBy, :isActive, :isAdmin, :status)
    `).run({
        id: TEST_USER_ID,
        name: 'Follow Repo Test User',
        telegramUsername: '@follow_repo_test_user',
        telegramId: 960010001,
        createdAt: timestamp,
        modifiedAt: timestamp,
        modifiedBy: SYSTEM_USER_ID,
        isActive: 1,
        isAdmin: 0,
        status: 'ACTIVE'
    });
}

function cleanupFollowData(): void {
    dbManager.db.prepare('DELETE FROM clubFollow WHERE userId = ?').run(TEST_USER_ID);
    dbManager.db.prepare("DELETE FROM club WHERE name LIKE 'Follow Repo Test Club %'").run();
}

describe('ClubFollowRepository', () => {
    const clubRepository = new ClubRepository();
    const followRepository = new ClubFollowRepository();

    beforeAll(() => {
        seedTestUser();
    });

    afterEach(() => {
        cleanupFollowData();
    });

    afterAll(() => {
        cleanupFollowData();
        dbManager.db.prepare('DELETE FROM user WHERE id = ?').run(TEST_USER_ID);
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    function createClub(name: string, isActive = true): number {
        return clubRepository.createClub({
            name,
            address: null,
            city: null,
            description: null,
            contactInfo: null,
            isActive,
            createdAt: new Date('2026-04-01T10:00:00.000Z'),
            modifiedBy: SYSTEM_USER_ID
        });
    }

    it('creates and finds a follow', () => {
        const clubId = createClub('Follow Repo Test Club A');

        expect(followRepository.findFollow(clubId, TEST_USER_ID)).toBeUndefined();

        followRepository.createFollow({ clubId, userId: TEST_USER_ID, modifiedBy: SYSTEM_USER_ID });

        const follow = followRepository.findFollow(clubId, TEST_USER_ID);
        expect(follow).toBeDefined();
        expect(follow).toMatchObject({ clubId, userId: TEST_USER_ID, modifiedBy: SYSTEM_USER_ID });
    });

    it('createFollow is idempotent', () => {
        const clubId = createClub('Follow Repo Test Club B');

        followRepository.createFollow({ clubId, userId: TEST_USER_ID, modifiedBy: SYSTEM_USER_ID });
        followRepository.createFollow({ clubId, userId: TEST_USER_ID, modifiedBy: SYSTEM_USER_ID });

        const count = dbManager.db
            .prepare('SELECT COUNT(*) as count FROM clubFollow WHERE clubId = ? AND userId = ?')
            .get(clubId, TEST_USER_ID) as { count: number };
        expect(count.count).toBe(1);
    });

    it('deletes a follow', () => {
        const clubId = createClub('Follow Repo Test Club C');

        followRepository.createFollow({ clubId, userId: TEST_USER_ID, modifiedBy: SYSTEM_USER_ID });
        followRepository.deleteFollow(clubId, TEST_USER_ID);

        expect(followRepository.findFollow(clubId, TEST_USER_ID)).toBeUndefined();
    });

    it('findFollowedClubsByUserId returns only active followed clubs', () => {
        const activeClubId = createClub('Follow Repo Test Club Active');
        const inactiveClubId = createClub('Follow Repo Test Club Inactive', false);

        followRepository.createFollow({ clubId: activeClubId, userId: TEST_USER_ID, modifiedBy: SYSTEM_USER_ID });
        followRepository.createFollow({ clubId: inactiveClubId, userId: TEST_USER_ID, modifiedBy: SYSTEM_USER_ID });

        const clubs = followRepository.findFollowedClubsByUserId(TEST_USER_ID);
        const ids = clubs.map(club => club.id);
        expect(ids).toContain(activeClubId);
        expect(ids).not.toContain(inactiveClubId);
    });
});
