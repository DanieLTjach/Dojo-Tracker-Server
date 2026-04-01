import dedent from 'dedent';
import config from '../../config/config.ts';
import {
    ClubMembershipAlreadyExistsError,
    ClubMembershipNotFoundError,
    InvalidClubMembershipStateError
} from '../error/ClubErrors.ts';
import type { Club, ClubMembership, ClubRole, UserClubMembership } from '../model/ClubModels.ts';
import type { User } from '../model/UserModels.ts';
import { ClubMembershipRepository } from '../repository/ClubMembershipRepository.ts';
import { ClubService } from './ClubService.ts';
import { UserService } from './UserService.ts';
import TelegramMessageService from './TelegramMessageService.ts';import LogService from './LogService.ts';
import { globalClubLogsTopic } from '../model/TelegramTopic.ts';
export class ClubMembershipService {
    private clubService: ClubService = new ClubService();
    private membershipRepository: ClubMembershipRepository = new ClubMembershipRepository();
    private userService: UserService = new UserService();

    getMembers(clubId: number): ClubMembership[] {
        this.clubService.validateClubExists(clubId);
        return this.membershipRepository.findMembersByClubId(clubId);
    }

    getActiveMembersByClubId(clubId: number): ClubMembership[] {
        this.clubService.validateClubExists(clubId);
        return this.membershipRepository.findActiveMembersByClubId(clubId);
    }

    getPendingMembers(clubId: number): ClubMembership[] {
        this.clubService.validateClubExists(clubId);
        return this.membershipRepository.findPendingMembersByClubId(clubId);
    }

    getUserClubRole(clubId: number, userId: number): ClubRole | undefined {
        return this.membershipRepository.getUserClubRole(clubId, userId);
    }

    getUserClubMembership(clubId: number, userId: number): UserClubMembership | undefined {
        const user = this.userService.getUserById(userId);
        const membership = this.membershipRepository.findMembership(clubId, userId);
        return membership !== undefined ? buildUserClubMembership(membership, user) : undefined;
    }

    getUserClubMemberships(userId: number): UserClubMembership[] {
        const user = this.userService.getUserById(userId);
        const memberships = this.membershipRepository.findMembershipsByUserId(userId);

        return memberships.map((membership) => buildUserClubMembership(membership, user));
    }

    requestJoin(clubId: number, userId: number, modifiedBy: number): ClubMembership {
        const club = this.clubService.getClubById(clubId);
        this.userService.validateUserExistsById(userId);

        const existingMembership = this.membershipRepository.findMembership(clubId, userId);
        if (existingMembership) {
            if (existingMembership.status === 'PENDING') {
                return existingMembership;
            }
            if (existingMembership.status === 'ACTIVE') {
                throw new ClubMembershipAlreadyExistsError(club.name, userId);
            }
            // INACTIVE — user wants to re-join, update status back to PENDING
            this.membershipRepository.updateMembershipStatus(clubId, userId, 'PENDING', modifiedBy);
            return this.getMembership(clubId, userId);
        }

        const now = new Date();
        this.membershipRepository.createMembership({
            clubId,
            userId,
            role: 'MEMBER',
            status: 'PENDING',
            createdAt: now,
            modifiedAt: now,
            modifiedBy
        });

        const newMembership = this.getMembership(clubId, userId);
        this.logJoinRequest(newMembership, userId);
        return newMembership;
    }

    leaveClub(clubId: number, userId: number): ClubMembership {
        this.clubService.validateClubExists(clubId);
        const membership = this.getMembership(clubId, userId);
        this.validateMembershipExists(clubId, userId);

        this.membershipRepository.updateMembershipStatus(clubId, userId, 'INACTIVE', userId);
        this.logLeftClub(membership, userId);
        return this.getMembership(clubId, userId);
    }

    activateMember(clubId: number, userId: number, modifiedBy: number): ClubMembership {
        const user = this.userService.getUserById(userId);
        const club = this.clubService.getClubById(clubId);

        const membership = this.getMembership(clubId, userId);
        if (membership.status !== 'PENDING') {
            throw new InvalidClubMembershipStateError('активувати', membership.status, ['PENDING']);
        }

        this.membershipRepository.updateMembershipStatus(clubId, userId, 'ACTIVE', modifiedBy);
        this.notifyUserAddedToClub(user, club);
        const newMembership = this.getMembership(clubId, userId);
        this.logMemberActivated(newMembership, modifiedBy);
        return newMembership;
    }

    deactivateMember(clubId: number, userId: number, modifiedBy: number): ClubMembership {
        this.clubService.validateClubExists(clubId);
        const membership = this.getMembership(clubId, userId);
        this.validateMembershipExists(clubId, userId);

        this.membershipRepository.updateMembershipStatus(clubId, userId, 'INACTIVE', modifiedBy);
        this.logMemberDeactivated(membership, modifiedBy);
        return this.getMembership(clubId, userId);
    }

    updateMemberRole(clubId: number, userId: number, role: ClubRole, modifiedBy: number): ClubMembership {
        this.clubService.validateClubExists(clubId);

        const oldMembership = this.getMembership(clubId, userId);
        if (oldMembership.status !== 'ACTIVE') {
            throw new InvalidClubMembershipStateError('змінити роль', oldMembership.status, ['ACTIVE']);
        }

        this.membershipRepository.updateMembershipRole(clubId, userId, role, modifiedBy);
        const newMembership = this.getMembership(clubId, userId);
        this.logMemberRoleChanged(oldMembership, newMembership, modifiedBy);
        return newMembership;
    }

    private validateMembershipExists(clubId: number, userId: number): void {
        this.getMembership(clubId, userId);
    }

    private getMembership(clubId: number, userId: number): ClubMembership {
        const membership = this.membershipRepository.findMembership(clubId, userId);
        if (!membership) {
            const club = this.clubService.getClubById(clubId);
            throw new ClubMembershipNotFoundError(club.name, userId);
        }
        return membership;
    }

    private notifyUserAddedToClub(user: User, club: Club): void {
        if (user.telegramId === null) {
            return;
        }

        const message = dedent`
            <b>Ваc додано до клубу ${club.name}!</b>

            Тепер ви є повноцінним членом клубу та можете додавати нові ігри.
            <a href="${config.botUrl}">Відкрити додаток</a>
        `;
        void TelegramMessageService.sendDirectMessage(user.telegramId!, message);
    }

    private logJoinRequest(membership: ClubMembership, userId: number): void {
        const user = this.userService.getUserById(userId);
        const message = dedent`
            <b>🔔 Club Join Request</b>

            <b>Club:</b> ${membership.clubName} <code>(ID: ${membership.clubId})</code>
            <b>User:</b> ${user.name} <code>(ID: ${user.id})</code>
            <b>Status:</b> ${membership.status}
        `;
        LogService.logInfo(message, globalClubLogsTopic);
    }

    private logLeftClub(membership: ClubMembership, userId: number): void {
        const user = this.userService.getUserById(userId);
        const message = dedent`
            <b>🚪 Member Left Club</b>

            <b>Club:</b> ${membership.clubName} <code>(ID: ${membership.clubId})</code>
            <b>User:</b> ${user.name} <code>(ID: ${user.id})</code>
            <b>Previous Role:</b> ${membership.role}
        `;
        LogService.logInfo(message, globalClubLogsTopic);
    }

    private logMemberActivated(membership: ClubMembership, modifiedBy: number): void {
        const user = this.userService.getUserById(membership.userId);
        const modifier = this.userService.getUserById(modifiedBy);
        const message = dedent`
            <b>✅ Member Approved</b>

            <b>Club:</b> ${membership.clubName} <code>(ID: ${membership.clubId})</code>
            <b>User:</b> ${user.name} <code>(ID: ${user.id})</code>
            <b>Role:</b> ${membership.role}
            <b>Approved by:</b> ${modifier.name} <code>(ID: ${modifier.id})</code>
        `;
        LogService.logInfo(message, globalClubLogsTopic);
    }

    private logMemberDeactivated(membership: ClubMembership, modifiedBy: number): void {
        const user = this.userService.getUserById(membership.userId);
        const modifier = this.userService.getUserById(modifiedBy);
        const message = dedent`
            <b>❌ Member Removed</b>

            <b>Club:</b> ${membership.clubName} <code>(ID: ${membership.clubId})</code>
            <b>User:</b> ${user.name} <code>(ID: ${user.id})</code>
            <b>Previous Role:</b> ${membership.role}
            <b>Removed by:</b> ${modifier.name} <code>(ID: ${modifier.id})</code>
        `;
        LogService.logInfo(message, globalClubLogsTopic);
    }

    private logMemberRoleChanged(oldMembership: ClubMembership, newMembership: ClubMembership, modifiedBy: number): void {
        const user = this.userService.getUserById(newMembership.userId);
        const modifier = this.userService.getUserById(modifiedBy);
        const message = dedent`
            <b>🔄 Member Role Changed</b>

            <b>Club:</b> ${newMembership.clubName} <code>(ID: ${newMembership.clubId})</code>
            <b>User:</b> ${user.name} <code>(ID: ${user.id})</code>
            <b>Role:</b> ${oldMembership.role} → ${newMembership.role}
            <b>Changed by:</b> ${modifier.name} <code>(ID: ${modifier.id})</code>
        `;
        LogService.logInfo(message, globalClubLogsTopic);
    }
}

function buildUserClubMembership(membership: ClubMembership, user: User): UserClubMembership {
    const isClubManager = membership.status === 'ACTIVE' && (membership.role === 'OWNER' || membership.role === 'MODERATOR');

    return {
        clubId: membership.clubId,
        clubName: membership.clubName,
        role: membership.role,
        status: membership.status,
        permissions: {
            canEditClub: user.isAdmin || (membership.status === 'ACTIVE' && membership.role === 'OWNER'),
            canManageMembers: user.isAdmin || isClubManager
        }
    };
}
