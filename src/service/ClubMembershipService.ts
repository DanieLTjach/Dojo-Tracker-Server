import dedent from 'dedent';
import config from '../../config/config.ts';
import {
    ClubMembershipAlreadyExistsError,
    ClubMembershipNotFoundError,
    InsufficientClubPermissionsError,
    InvalidClubMembershipStateError,
} from '../error/ClubErrors.ts';
import type { Club, ClubMembership, ClubRole, UserClubMembership } from '../model/ClubModels.ts';
import type { User } from '../model/UserModels.ts';
import { ClubMembershipRepository } from '../repository/ClubMembershipRepository.ts';
import { ClubService } from './ClubService.ts';
import { UserService } from './UserService.ts';
import TelegramMessageService from './TelegramMessageService.ts';
import LogService from './LogService.ts';
import { GLOBAL_LOGS_LOCALE, globalClubLogsTopic } from '../model/TelegramTopic.ts';
import { t, translationRef } from '../i18n/index.ts';
import { resolveEffectiveLocale } from '../util/LocaleResolver.ts';
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

    validateUserCanEditClub(clubId: number, userId: number): void {
        const user = this.userService.getUserById(userId);
        if (user.isAdmin) {
            return;
        }
        if (!this.getUserClubMembership(clubId, userId)?.permissions.canEditClub) {
            throw new InsufficientClubPermissionsError('OWNER');
        }
    }

    public userIsAdminOrHasClubRole(clubId: number | null, userId: number, allowedRoles: ClubRole[]): boolean {
        const user = this.userService.getUserById(userId);
        if (user.isAdmin) {
            return true;
        }

        if (clubId === null) {
            return false;
        }

        const role = this.getUserClubRole(clubId, userId);
        return role !== undefined && allowedRoles.includes(role);
    }

    getUserClubMemberships(userId: number): UserClubMembership[] {
        const user = this.userService.getUserById(userId);
        const memberships = this.membershipRepository.findMembershipsByUserId(userId);

        return memberships.map(membership => buildUserClubMembership(membership, user));
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
            modifiedBy,
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
            throw new InvalidClubMembershipStateError(translationRef('telegram.actions.activate'), membership.status, [
                'PENDING',
            ]);
        }

        this.membershipRepository.updateMembershipStatus(clubId, userId, 'ACTIVE', modifiedBy);
        this.notifyUserAddedToClub(user, club);
        const newMembership = this.getMembership(clubId, userId);
        this.logMemberActivated(newMembership, modifiedBy);
        return newMembership;
    }

    /**
     * Creates (or re-activates) an ACTIVE MEMBER membership directly, bypassing the
     * PENDING→approve flow. Used by auto-approve invite codes. Idempotent: if the user
     * is already an ACTIVE member, returns the existing membership without re-notifying.
     */
    createActiveMembership(clubId: number, userId: number, modifiedBy: number): ClubMembership {
        const user = this.userService.getUserById(userId);
        const club = this.clubService.getClubById(clubId);

        const existing = this.membershipRepository.findMembership(clubId, userId);
        if (existing?.status === 'ACTIVE') {
            return existing;
        }

        if (existing) {
            this.membershipRepository.updateMembershipStatus(clubId, userId, 'ACTIVE', modifiedBy);
        } else {
            const now = new Date();
            this.membershipRepository.createMembership({
                clubId,
                userId,
                role: 'MEMBER',
                status: 'ACTIVE',
                createdAt: now,
                modifiedAt: now,
                modifiedBy,
            });
        }

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
            throw new InvalidClubMembershipStateError(
                translationRef('telegram.actions.changeRole'),
                oldMembership.status,
                [
                    'ACTIVE',
                ]
            );
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
        const locale = resolveEffectiveLocale(user, club);

        const message = dedent`
            <b>${t('telegram.notify.addedToClubTitle', { clubName: club.name }, locale)}</b>

            ${t('telegram.notify.addedToClubBody', {}, locale)}
            <a href="${config.botUrl}">${t('telegram.notify.openApp', {}, locale)}</a>
        `;
        void TelegramMessageService.sendDirectMessage(user.telegramId!, message);
    }

    private logClubEvent(clubId: number, buildMessage: (locale: string) => string): void {
        LogService.logInfo(buildMessage(GLOBAL_LOGS_LOCALE), globalClubLogsTopic);
        const clubLogsTopic = this.clubService.getClubTelegramTopics(clubId).clubLogs;
        if (clubLogsTopic !== null) {
            const locale = this.resolveClubLocale(clubId);
            LogService.logInfo(buildMessage(locale), clubLogsTopic);
        }
    }

    private resolveClubLocale(clubId: number): string {
        return resolveEffectiveLocale(null, this.clubService.getClubById(clubId));
    }

    private logJoinRequest(membership: ClubMembership, userId: number): void {
        const user = this.userService.getUserById(userId);
        this.logClubEvent(membership.clubId, locale => {
            const tr = (key: string) => t(key, {}, locale);
            return dedent`
                <b>${tr('telegram.membershipLog.joinRequestTitle')}</b>

                <b>${
                tr('telegram.membershipLog.clubLabel')
            }</b> ${membership.clubName} <code>(ID: ${membership.clubId})</code>
                <b>${tr('telegram.membershipLog.userLabel')}</b> ${user.name} <code>(ID: ${user.id})</code>
                <b>${tr('telegram.membershipLog.statusLabel')}</b> ${membership.status}
            `;
        });
    }

    private logLeftClub(membership: ClubMembership, userId: number): void {
        const user = this.userService.getUserById(userId);
        this.logClubEvent(membership.clubId, locale => {
            const tr = (key: string) => t(key, {}, locale);
            return dedent`
                <b>${tr('telegram.membershipLog.leftClubTitle')}</b>

                <b>${
                tr('telegram.membershipLog.clubLabel')
            }</b> ${membership.clubName} <code>(ID: ${membership.clubId})</code>
                <b>${tr('telegram.membershipLog.userLabel')}</b> ${user.name} <code>(ID: ${user.id})</code>
                <b>${tr('telegram.membershipLog.previousRoleLabel')}</b> ${membership.role}
            `;
        });
    }

    private logMemberActivated(membership: ClubMembership, modifiedBy: number): void {
        const user = this.userService.getUserById(membership.userId);
        const modifier = this.userService.getUserById(modifiedBy);
        this.logClubEvent(membership.clubId, locale => {
            const tr = (key: string) => t(key, {}, locale);
            return dedent`
                <b>${tr('telegram.membershipLog.memberApprovedTitle')}</b>

                <b>${
                tr('telegram.membershipLog.clubLabel')
            }</b> ${membership.clubName} <code>(ID: ${membership.clubId})</code>
                <b>${tr('telegram.membershipLog.userLabel')}</b> ${user.name} <code>(ID: ${user.id})</code>
                <b>${tr('telegram.membershipLog.roleLabel')}</b> ${membership.role}
                <b>${
                tr('telegram.membershipLog.approvedByLabel')
            }</b> ${modifier.name} <code>(ID: ${modifier.id})</code>
            `;
        });
    }

    private logMemberDeactivated(membership: ClubMembership, modifiedBy: number): void {
        const user = this.userService.getUserById(membership.userId);
        const modifier = this.userService.getUserById(modifiedBy);
        this.logClubEvent(membership.clubId, locale => {
            const tr = (key: string) => t(key, {}, locale);
            return dedent`
                <b>${tr('telegram.membershipLog.memberRemovedTitle')}</b>

                <b>${
                tr('telegram.membershipLog.clubLabel')
            }</b> ${membership.clubName} <code>(ID: ${membership.clubId})</code>
                <b>${tr('telegram.membershipLog.userLabel')}</b> ${user.name} <code>(ID: ${user.id})</code>
                <b>${tr('telegram.membershipLog.previousRoleLabel')}</b> ${membership.role}
                <b>${tr('telegram.membershipLog.removedByLabel')}</b> ${modifier.name} <code>(ID: ${modifier.id})</code>
            `;
        });
    }

    private logMemberRoleChanged(
        oldMembership: ClubMembership,
        newMembership: ClubMembership,
        modifiedBy: number
    ): void {
        const user = this.userService.getUserById(newMembership.userId);
        const modifier = this.userService.getUserById(modifiedBy);
        this.logClubEvent(newMembership.clubId, locale => {
            const tr = (key: string) => t(key, {}, locale);
            return dedent`
                <b>${tr('telegram.membershipLog.roleChangedTitle')}</b>

                <b>${
                tr('telegram.membershipLog.clubLabel')
            }</b> ${newMembership.clubName} <code>(ID: ${newMembership.clubId})</code>
                <b>${tr('telegram.membershipLog.userLabel')}</b> ${user.name} <code>(ID: ${user.id})</code>
                <b>${tr('telegram.membershipLog.roleLabel')}</b> ${oldMembership.role} → ${newMembership.role}
                <b>${tr('telegram.membershipLog.changedByLabel')}</b> ${modifier.name} <code>(ID: ${modifier.id})</code>
            `;
        });
    }
}

function buildUserClubMembership(membership: ClubMembership, user: User): UserClubMembership {
    const isClubManager = membership.status === 'ACTIVE' &&
        (membership.role === 'OWNER' || membership.role === 'MODERATOR');

    return {
        clubId: membership.clubId,
        clubName: membership.clubName,
        role: membership.role,
        status: membership.status,
        permissions: {
            canEditClub: user.isAdmin || (membership.status === 'ACTIVE' && membership.role === 'OWNER'),
            canManageMembers: user.isAdmin || isClubManager,
        },
    };
}
