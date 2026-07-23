import { ClubAchievementService } from '../src/service/ClubAchievementService.ts';
import { ClubRepository } from '../src/repository/ClubRepository.ts';
import { ClubMembershipService } from '../src/service/ClubMembershipService.ts';
import { UserService } from '../src/service/UserService.ts';
import { UserRepository } from '../src/repository/UserRepository.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import {
    ClubAchievementAlreadyAssignedError,
    ClubAchievementAssignmentAlreadyRevokedError,
    ClubAchievementAssignmentNotFoundError,
    ClubAchievementDefinitionArchivedError,
    ClubAchievementDefinitionNameAlreadyExistsError,
    ClubAchievementDefinitionNotFoundError,
    InvalidAchievementSourceError,
    TargetNotActiveClubMemberError,
    UnknownBuiltInAchievementCodeError,
} from '../src/error/ClubAchievementErrors.ts';
import { ClubNotFoundError } from '../src/error/ClubErrors.ts';

const SYSTEM_USER_ID = 0;

describe('ClubAchievementService', () => {
    const achievementService = new ClubAchievementService();
    const clubRepository = new ClubRepository();
    const membershipService = new ClubMembershipService();
    const userService = new UserService();
    const userRepository = new UserRepository();
    let clubId: number;
    let otherClubId: number;
    let activeMemberId: number;
    let inactiveMemberId: number;

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

        const activeUser = userService.registerUser('AchSvcActiveMember', 'ach_svc_active', 666688801, SYSTEM_USER_ID);
        const inactiveUser = userService.registerUser(
            'AchSvcInactiveMember',
            'ach_svc_inactive',
            666688802,
            SYSTEM_USER_ID
        );
        activeMemberId = activeUser.id;
        inactiveMemberId = inactiveUser.id;
        userRepository.updateUserStatus(activeMemberId, true, 'ACTIVE', SYSTEM_USER_ID);
        userRepository.updateUserStatus(inactiveMemberId, true, 'ACTIVE', SYSTEM_USER_ID);

        membershipService.createActiveMembership(clubId, activeMemberId, SYSTEM_USER_ID);
        membershipService.requestJoin(clubId, inactiveMemberId, inactiveMemberId);
        membershipService.activateMember(clubId, inactiveMemberId, SYSTEM_USER_ID);
        membershipService.deactivateMember(clubId, inactiveMemberId, SYSTEM_USER_ID);
    });

    afterEach(() => {
        dbManager.db.prepare('DELETE FROM clubUserAchievement WHERE clubId IN (?, ?)').run(clubId, otherClubId);
        dbManager.db.prepare('DELETE FROM clubAchievementDefinition WHERE clubId IN (?, ?)').run(
            clubId,
            otherClubId
        );
    });

    afterAll(() => {
        dbManager.db.prepare('DELETE FROM clubMembership WHERE clubId IN (?, ?)').run(clubId, otherClubId);
        dbManager.db.prepare('DELETE FROM club WHERE id IN (?, ?)').run(clubId, otherClubId);
        dbManager.db.prepare('DELETE FROM user WHERE id IN (?, ?)').run(activeMemberId, inactiveMemberId);
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

    describe('assignAchievement', () => {
        it('assigns a built-in achievement to an active member', () => {
            const assignment = achievementService.assignAchievement(
                clubId,
                activeMemberId,
                { builtInCode: 'MENTOR', definitionId: undefined, newDefinition: undefined },
                'Great with newcomers',
                SYSTEM_USER_ID
            );

            expect(assignment).toMatchObject({
                clubId,
                userId: activeMemberId,
                builtInCode: 'MENTOR',
                definitionId: null,
                note: 'Great with newcomers',
                revokedAt: null,
            });
        });

        it('assigns an existing custom definition', () => {
            const definition = achievementService.createDefinition(
                clubId,
                'Custom Award',
                'desc',
                null,
                SYSTEM_USER_ID
            );

            const assignment = achievementService.assignAchievement(
                clubId,
                activeMemberId,
                { builtInCode: undefined, definitionId: definition.id, newDefinition: undefined },
                null,
                SYSTEM_USER_ID
            );

            expect(assignment).toMatchObject({ definitionId: definition.id, builtInCode: null });
        });

        it('atomically creates a new definition and assigns it', () => {
            const assignment = achievementService.assignAchievement(
                clubId,
                activeMemberId,
                {
                    builtInCode: undefined,
                    definitionId: undefined,
                    newDefinition: { name: 'Brand New Award', description: 'desc', icon: null },
                },
                null,
                SYSTEM_USER_ID
            );

            expect(assignment.definitionId).not.toBeNull();
            expect(achievementService.getCatalog(clubId).map(d => d.name)).toContain('Brand New Award');
        });

        it('rejects providing zero or multiple sources', () => {
            expect(() =>
                achievementService.assignAchievement(
                    clubId,
                    activeMemberId,
                    { builtInCode: undefined, definitionId: undefined, newDefinition: undefined },
                    null,
                    SYSTEM_USER_ID
                )
            ).toThrow(InvalidAchievementSourceError);

            expect(() =>
                achievementService.assignAchievement(
                    clubId,
                    activeMemberId,
                    { builtInCode: 'MENTOR', definitionId: 1, newDefinition: undefined },
                    null,
                    SYSTEM_USER_ID
                )
            ).toThrow(InvalidAchievementSourceError);
        });

        it('rejects an unknown built-in code', () => {
            expect(() =>
                achievementService.assignAchievement(
                    clubId,
                    activeMemberId,
                    { builtInCode: 'NOT_A_REAL_CODE', definitionId: undefined, newDefinition: undefined },
                    null,
                    SYSTEM_USER_ID
                )
            ).toThrow(UnknownBuiltInAchievementCodeError);
        });

        it('rejects assigning to a non-active member', () => {
            expect(() =>
                achievementService.assignAchievement(
                    clubId,
                    inactiveMemberId,
                    { builtInCode: 'MENTOR', definitionId: undefined, newDefinition: undefined },
                    null,
                    SYSTEM_USER_ID
                )
            ).toThrow(TargetNotActiveClubMemberError);
        });

        it('rejects a duplicate active assignment of the same built-in achievement', () => {
            achievementService.assignAchievement(
                clubId,
                activeMemberId,
                { builtInCode: 'FAIR_PLAY', definitionId: undefined, newDefinition: undefined },
                null,
                SYSTEM_USER_ID
            );

            expect(() =>
                achievementService.assignAchievement(
                    clubId,
                    activeMemberId,
                    { builtInCode: 'FAIR_PLAY', definitionId: undefined, newDefinition: undefined },
                    null,
                    SYSTEM_USER_ID
                )
            ).toThrow(ClubAchievementAlreadyAssignedError);
        });
    });

    describe('revokeAssignment', () => {
        it('revokes an active assignment and allows a fresh re-assignment afterwards', () => {
            const assignment = achievementService.assignAchievement(
                clubId,
                activeMemberId,
                { builtInCode: 'RISING_STAR', definitionId: undefined, newDefinition: undefined },
                null,
                SYSTEM_USER_ID
            );

            const revoked = achievementService.revokeAssignment(
                clubId,
                activeMemberId,
                assignment.id,
                SYSTEM_USER_ID
            );
            expect(revoked.revokedAt).not.toBeNull();
            expect(revoked.revokedBy).toBe(SYSTEM_USER_ID);

            expect(() =>
                achievementService.assignAchievement(
                    clubId,
                    activeMemberId,
                    { builtInCode: 'RISING_STAR', definitionId: undefined, newDefinition: undefined },
                    null,
                    SYSTEM_USER_ID
                )
            ).not.toThrow();
        });

        it('rejects revoking an already-revoked assignment', () => {
            const assignment = achievementService.assignAchievement(
                clubId,
                activeMemberId,
                { builtInCode: 'IRON_WILL', definitionId: undefined, newDefinition: undefined },
                null,
                SYSTEM_USER_ID
            );
            achievementService.revokeAssignment(clubId, activeMemberId, assignment.id, SYSTEM_USER_ID);

            expect(() => achievementService.revokeAssignment(clubId, activeMemberId, assignment.id, SYSTEM_USER_ID))
                .toThrow(ClubAchievementAssignmentAlreadyRevokedError);
        });

        it('404s for an assignment id that does not belong to this club/user', () => {
            expect(() => achievementService.revokeAssignment(clubId, activeMemberId, 999999, SYSTEM_USER_ID)).toThrow(
                ClubAchievementAssignmentNotFoundError
            );
        });
    });
});
