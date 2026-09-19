import { ClubAchievementRepository } from '../src/repository/ClubAchievementRepository.ts';
import { ClubRepository } from '../src/repository/ClubRepository.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';

const SYSTEM_USER_ID = 0;
const TEST_USER_ID = 93101;

function seedTestUser(): void {
    const timestamp = new Date().toISOString();
    dbManager.db.prepare(`
        INSERT INTO user (id, name, telegramUsername, telegramId, createdAt, modifiedAt, modifiedBy, isActive, isAdmin, status)
        VALUES (:id, :name, :telegramUsername, :telegramId, :createdAt, :modifiedAt, :modifiedBy, :isActive, :isAdmin, :status)
    `).run({
        id: TEST_USER_ID,
        name: 'Achievement Repo User',
        telegramUsername: '@achievement_repo_user',
        telegramId: 931010001,
        createdAt: timestamp,
        modifiedAt: timestamp,
        modifiedBy: SYSTEM_USER_ID,
        isActive: 1,
        isAdmin: 0,
        status: 'ACTIVE',
    });
}

describe('ClubAchievementRepository', () => {
    const achievementRepository = new ClubAchievementRepository();
    const clubRepository = new ClubRepository();
    let clubId: number;

    beforeAll(() => {
        seedTestUser();
        clubId = clubRepository.createClub({
            name: 'Achievement Repo Club',
            address: null,
            city: null,
            country: 'UA',
            locale: 'uk',
            description: null,
            contactInfo: null,
            isActive: true,
            createdAt: new Date('2026-04-01T10:00:00.000Z'),
            modifiedBy: SYSTEM_USER_ID,
        });
    });

    afterEach(() => {
        dbManager.db.prepare(
            'DELETE FROM clubUserAchievement WHERE clubId = ?'
        ).run(clubId);
        dbManager.db.prepare('DELETE FROM clubAchievementDefinition WHERE clubId = ?').run(clubId);
    });

    afterAll(() => {
        dbManager.db.prepare('DELETE FROM club WHERE id = ?').run(clubId);
        dbManager.db.prepare('DELETE FROM user WHERE id = ?').run(TEST_USER_ID);
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    function createDefinition(name = 'Community Builder'): number {
        return achievementRepository.createDefinition({
            clubId,
            name,
            description: 'Helped grow the club.',
            icon: null,
            createdBy: SYSTEM_USER_ID,
            createdAt: new Date('2026-04-02T10:00:00.000Z'),
        }).id;
    }

    it('creates a custom definition and maps it back with dates', () => {
        const id = createDefinition();
        const definition = achievementRepository.findDefinitionById(id);

        expect(definition).toMatchObject({
            id,
            clubId,
            name: 'Community Builder',
            description: 'Helped grow the club.',
            icon: null,
            archivedAt: null,
            archivedBy: null,
            createdBy: SYSTEM_USER_ID,
            modifiedBy: SYSTEM_USER_ID,
        });
        expect(definition!.createdAt).toBeInstanceOf(Date);
    });

    it('finds an active definition by case-insensitive name and excludes archived ones', () => {
        const id = createDefinition('Mentor');

        expect(achievementRepository.findActiveDefinitionByName(clubId, 'mentor')).toMatchObject({ id });

        achievementRepository.setDefinitionArchived(id, true, SYSTEM_USER_ID, new Date('2026-04-03T00:00:00.000Z'));

        expect(achievementRepository.findActiveDefinitionByName(clubId, 'mentor')).toBeUndefined();
        const archived = achievementRepository.findDefinitionById(id);
        expect(archived?.archivedAt).toBeInstanceOf(Date);
        expect(archived?.archivedBy).toBe(SYSTEM_USER_ID);
    });

    it('unarchives a definition by clearing archivedAt/archivedBy', () => {
        const id = createDefinition('Fair Play');
        achievementRepository.setDefinitionArchived(id, true, SYSTEM_USER_ID, new Date('2026-04-03T00:00:00.000Z'));
        achievementRepository.setDefinitionArchived(id, false, SYSTEM_USER_ID, new Date('2026-04-04T00:00:00.000Z'));

        const definition = achievementRepository.findDefinitionById(id);
        expect(definition?.archivedAt).toBeNull();
        expect(definition?.archivedBy).toBeNull();
    });

    it('lists a club catalog ordered by name', () => {
        createDefinition('Zeta');
        createDefinition('Alpha');

        const names = achievementRepository.findDefinitionsByClubId(clubId).map(d => d.name);
        expect(names).toEqual(['Alpha', 'Zeta']);
    });

    it('creates a built-in assignment, finds it as active, and revokes it', () => {
        const assignment = achievementRepository.createAssignment({
            clubId,
            userId: TEST_USER_ID,
            builtInCode: 'MENTOR',
            definitionId: null,
            note: 'Great with newcomers',
            awardedBy: SYSTEM_USER_ID,
            awardedAt: new Date('2026-04-05T00:00:00.000Z'),
        });

        expect(achievementRepository.findActiveAssignmentByBuiltInCode(clubId, TEST_USER_ID, 'MENTOR'))
            .toMatchObject({ id: assignment.id, note: 'Great with newcomers' });

        achievementRepository.revokeAssignment(assignment.id, SYSTEM_USER_ID, new Date('2026-04-06T00:00:00.000Z'));

        expect(achievementRepository.findActiveAssignmentByBuiltInCode(clubId, TEST_USER_ID, 'MENTOR')).toBeUndefined();
        const revoked = achievementRepository.findAssignmentById(assignment.id);
        expect(revoked?.revokedAt).toBeInstanceOf(Date);
        expect(revoked?.revokedBy).toBe(SYSTEM_USER_ID);
    });

    it('creates a custom-definition assignment and lists it as an active user achievement', () => {
        const definitionId = createDefinition('Rising Star');
        achievementRepository.createAssignment({
            clubId,
            userId: TEST_USER_ID,
            builtInCode: null,
            definitionId,
            note: null,
            awardedBy: SYSTEM_USER_ID,
            awardedAt: new Date('2026-04-07T00:00:00.000Z'),
        });

        expect(achievementRepository.findActiveAssignmentByDefinitionId(clubId, TEST_USER_ID, definitionId))
            .toMatchObject({ definitionId });

        const active = achievementRepository.findActiveAssignmentsByUserId(TEST_USER_ID);
        expect(active.some(a => a.definitionId === definitionId)).toBe(true);
    });
});
