import { ClubAchievementService } from '../src/service/ClubAchievementService.ts';
import { ClubRepository } from '../src/repository/ClubRepository.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import {
    ClubAchievementDefinitionArchivedError,
    ClubAchievementDefinitionNameAlreadyExistsError,
    ClubAchievementDefinitionNotFoundError,
} from '../src/error/ClubAchievementErrors.ts';
import { ClubNotFoundError } from '../src/error/ClubErrors.ts';

const SYSTEM_USER_ID = 0;

describe('ClubAchievementService', () => {
    const achievementService = new ClubAchievementService();
    const clubRepository = new ClubRepository();
    let clubId: number;
    let otherClubId: number;

    beforeAll(() => {
        clubId = clubRepository.createClub({
            name: 'Achievement Service Club',
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
        otherClubId = clubRepository.createClub({
            name: 'Achievement Service Other Club',
            address: null,
            city: null,
            country: 'UA',
            locale: 'en',
            description: null,
            contactInfo: null,
            isActive: true,
            createdAt: new Date('2026-04-01T10:00:00.000Z'),
            modifiedBy: SYSTEM_USER_ID,
        });
    });

    afterEach(() => {
        dbManager.db.prepare('DELETE FROM clubUserAchievement WHERE clubId IN (?, ?)').run(clubId, otherClubId);
        dbManager.db.prepare('DELETE FROM clubAchievementDefinition WHERE clubId IN (?, ?)').run(
            clubId,
            otherClubId
        );
    });

    afterAll(() => {
        dbManager.db.prepare('DELETE FROM club WHERE id IN (?, ?)').run(clubId, otherClubId);
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    it('throws for an unknown club', () => {
        expect(() => achievementService.getCatalog(999999)).toThrow(ClubNotFoundError);
    });

    it('creates a definition and lists it in the catalog', () => {
        const definition = achievementService.createDefinition(
            clubId,
            'Community Builder',
            'Helped grow the club.',
            null,
            SYSTEM_USER_ID
        );

        expect(definition).toMatchObject({ clubId, name: 'Community Builder', archivedAt: null });
        expect(achievementService.getCatalog(clubId).map(d => d.id)).toContain(definition.id);
    });

    it('rejects a duplicate active name case-insensitively within the same club', () => {
        achievementService.createDefinition(clubId, 'Mentor', 'desc', null, SYSTEM_USER_ID);

        expect(() => achievementService.createDefinition(clubId, 'mentor', 'desc', null, SYSTEM_USER_ID)).toThrow(
            ClubAchievementDefinitionNameAlreadyExistsError
        );
    });

    it('allows the same name in a different club', () => {
        achievementService.createDefinition(clubId, 'Fair Play', 'desc', null, SYSTEM_USER_ID);

        expect(() => achievementService.createDefinition(otherClubId, 'Fair Play', 'desc', null, SYSTEM_USER_ID)).not
            .toThrow();
    });

    it('archives a definition and frees its name for reuse', () => {
        const definition = achievementService.createDefinition(clubId, 'Rising Star', 'desc', null, SYSTEM_USER_ID);

        const archived = achievementService.setDefinitionArchived(clubId, definition.id, true, SYSTEM_USER_ID);
        expect(archived.archivedAt).not.toBeNull();
        expect(archived.archivedBy).toBe(SYSTEM_USER_ID);

        expect(() => achievementService.createDefinition(clubId, 'Rising Star', 'desc', null, SYSTEM_USER_ID)).not
            .toThrow();
    });

    it('unarchives a definition, but rejects it if the name was reused meanwhile', () => {
        const definition = achievementService.createDefinition(clubId, 'Iron Will', 'desc', null, SYSTEM_USER_ID);
        achievementService.setDefinitionArchived(clubId, definition.id, true, SYSTEM_USER_ID);
        achievementService.createDefinition(clubId, 'Iron Will', 'new desc', null, SYSTEM_USER_ID);

        expect(() => achievementService.setDefinitionArchived(clubId, definition.id, false, SYSTEM_USER_ID)).toThrow(
            ClubAchievementDefinitionNameAlreadyExistsError
        );
    });

    it('throws when archiving a definition that does not exist or belongs to another club', () => {
        expect(() => achievementService.setDefinitionArchived(clubId, 999999, true, SYSTEM_USER_ID)).toThrow(
            ClubAchievementDefinitionNotFoundError
        );

        const otherClubDefinition = achievementService.createDefinition(
            otherClubId,
            'Cross-Club',
            'desc',
            null,
            SYSTEM_USER_ID
        );
        expect(() => achievementService.setDefinitionArchived(clubId, otherClubDefinition.id, true, SYSTEM_USER_ID))
            .toThrow(ClubAchievementDefinitionNotFoundError);
    });

    it('rejects assigning an archived definition', () => {
        const definition = achievementService.createDefinition(
            clubId,
            'Hospitality Hero',
            'desc',
            null,
            SYSTEM_USER_ID
        );
        achievementService.setDefinitionArchived(clubId, definition.id, true, SYSTEM_USER_ID);

        expect(() => achievementService.validateAssignableDefinition(clubId, definition.id)).toThrow(
            ClubAchievementDefinitionArchivedError
        );
    });

    it('allows assigning an active definition', () => {
        const definition = achievementService.createDefinition(clubId, 'Volunteer', 'desc', null, SYSTEM_USER_ID);

        expect(achievementService.validateAssignableDefinition(clubId, definition.id)).toMatchObject({
            id: definition.id,
        });
    });
});
