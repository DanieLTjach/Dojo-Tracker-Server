import { ProfileAchievementService } from '../src/service/ProfileAchievementService.ts';
import { ClubAchievementService } from '../src/service/ClubAchievementService.ts';
import { ClubMembershipService } from '../src/service/ClubMembershipService.ts';
import { ClubRepository } from '../src/repository/ClubRepository.ts';
import { UserService } from '../src/service/UserService.ts';
import { UserRepository } from '../src/repository/UserRepository.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { ProfileAchievementType } from '../src/model/AchievementModels.ts';

const SYSTEM_USER_ID = 0;

describe('ProfileAchievementService (manual achievements on the profile page)', () => {
    const profileAchievementService = new ProfileAchievementService();
    const clubAchievementService = new ClubAchievementService();
    const membershipService = new ClubMembershipService();
    const clubRepository = new ClubRepository();
    const userService = new UserService();
    const userRepository = new UserRepository();

    let clubId: number;
    let memberId: number;

    beforeAll(() => {
        clubId = clubRepository.createClub({
            name: 'Profile Manual Achievement Club',
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

        const user = userService.registerUser('ProfileManualMember', 'profile_manual', 666699901, SYSTEM_USER_ID);
        memberId = user.id;
        userRepository.updateUserStatus(memberId, true, 'ACTIVE', SYSTEM_USER_ID);
        membershipService.createActiveMembership(clubId, memberId, SYSTEM_USER_ID);
    });

    afterEach(() => {
        dbManager.db.prepare('DELETE FROM clubUserAchievement WHERE clubId = ?').run(clubId);
        dbManager.db.prepare('DELETE FROM clubAchievementDefinition WHERE clubId = ?').run(clubId);
    });

    afterAll(() => {
        dbManager.db.prepare('DELETE FROM clubMembership WHERE clubId = ?').run(clubId);
        dbManager.db.prepare('DELETE FROM club WHERE id = ?').run(clubId);
        dbManager.db.prepare('DELETE FROM user WHERE id = ?').run(memberId);
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    it('includes a built-in manual achievement with localized name/description', () => {
        clubAchievementService.assignAchievement(
            clubId,
            memberId,
            { builtInCode: 'MENTOR', definitionId: undefined, newDefinition: undefined },
            'Helped a lot',
            SYSTEM_USER_ID
        );

        const achievements = profileAchievementService.getUserAchievements(memberId, 'en', () => {});
        const mentor = achievements.find(a => a.code === 'MENTOR');

        expect(mentor).toMatchObject({
            type: ProfileAchievementType.MANUAL,
            name: 'Mentor',
            description: 'Taught and guided newer players.',
            clubId,
            clubName: 'Profile Manual Achievement Club',
            note: 'Helped a lot',
        });
    });

    it('includes a custom achievement with its own text, displayed as entered', () => {
        const definition = clubAchievementService.createDefinition(
            clubId,
            'Custom Trophy',
            'A custom description.',
            'trophy',
            SYSTEM_USER_ID
        );
        clubAchievementService.assignAchievement(
            clubId,
            memberId,
            { builtInCode: undefined, definitionId: definition.id, newDefinition: undefined },
            null,
            SYSTEM_USER_ID
        );

        const achievements = profileAchievementService.getUserAchievements(memberId, 'en', () => {});
        const custom = achievements.find(a => a.code === `custom:${definition.id}`);

        expect(custom).toMatchObject({
            type: ProfileAchievementType.MANUAL,
            name: 'Custom Trophy',
            description: 'A custom description.',
            icon: 'trophy',
        });
    });

    it('excludes a revoked achievement', () => {
        const assignment = clubAchievementService.assignAchievement(
            clubId,
            memberId,
            { builtInCode: 'FAIR_PLAY', definitionId: undefined, newDefinition: undefined },
            null,
            SYSTEM_USER_ID
        );
        clubAchievementService.revokeAssignment(clubId, memberId, assignment.id, SYSTEM_USER_ID);

        const achievements = profileAchievementService.getUserAchievements(memberId, 'en', () => {});
        expect(achievements.find(a => a.code === 'FAIR_PLAY')).toBeUndefined();
    });
});
