import { UserRepository } from '../repository/UserRepository.ts';
import {
    UserNotFoundById,
    UserNotFoundByTelegramId,
    UserWithThisTelegramIdAlreadyExists,
    UserIsNotActive,
    NameAlreadyTakenByAnotherUser,
    TelegramUsernameAlreadyTakenByAnotherUser,
    YouHaveToBeAdminToEditAnotherUser,
} from '../error/UserErrors.ts';
import type { User, UserStatus } from '../model/UserModels.ts';
import { ResponseStatusError } from '../error/BaseErrors.ts';
import LogService from './LogService.ts';
import dedent from 'dedent';
import { GLOBAL_LOGS_LOCALE, globalUserLogsTopic } from '../model/TelegramTopic.ts';
import { ClubMembershipRepository } from '../repository/ClubMembershipRepository.ts';
import { InsufficientPermissionsError } from '../error/AuthErrors.ts';
import type { ClubRole } from '../model/ClubModels.ts';
import { ClubService } from './ClubService.ts';
import { SupportedLocale, t } from '../i18n/index.ts';
import { resolveClubLocale } from '../util/LocaleResolver.ts';

export class UserService {
    private userRepository: UserRepository = new UserRepository();
    private clubMembershipRepository: ClubMembershipRepository = new ClubMembershipRepository();
    private clubService: ClubService = new ClubService();

    registerUser(
        userName: string,
        userTelegramUsername: string | undefined,
        userTelegramId: number,
        createdBy: number
    ): User {
        if (this.userExistsByName(userName)) {
            throw new NameAlreadyTakenByAnotherUser(userName);
        }
        if (this.userExistsByTelegramId(userTelegramId)) {
            throw new UserWithThisTelegramIdAlreadyExists(userTelegramId);
        }
        if (userTelegramUsername !== undefined && this.userExistsByTelegramUsername(userTelegramUsername)) {
            throw new TelegramUsernameAlreadyTakenByAnotherUser(userTelegramUsername);
        }

        const newUserId = this.userRepository.registerUser(userName, userTelegramUsername, userTelegramId, createdBy);
        const newUser = this.getUserById(newUserId);
        this.logRegisteredUser(newUser, createdBy);
        return newUser;
    }

    getUserStatusByTelegramId(telegramId: number): UserStatus {
        return this.getUserByTelegramId(telegramId).status;
    }

    getAllUsers(requestingUserId?: number, clubId?: number): User[] {
        const users = clubId !== undefined
            ? this.userRepository.findAllUsersByClubId(clubId)
            : this.userRepository.findAllUsers();
        return users.map(user => this.applyProfileVisibility(user, requestingUserId));
    }

    getUserById(id: number, requestingUserId?: number): User {
        const user = this.userRepository.findUserById(id);
        if (!user) {
            throw new UserNotFoundById(id);
        }
        return this.applyProfileVisibility(user, requestingUserId);
    }

    getOptionalUserByTelegramId(telegramId: number): User | undefined {
        return this.userRepository.findUserByTelegramId(telegramId);
    }

    getUserByTelegramId(telegramId: number, requestingUserId?: number): User {
        const user = this.userRepository.findUserByTelegramId(telegramId);
        if (!user) {
            throw new UserNotFoundByTelegramId(telegramId);
        }
        return this.applyProfileVisibility(user, requestingUserId);
    }

    editUser(
        userId: number,
        name: string | undefined,
        telegramUsername: string | undefined,
        modifiedBy: number
    ): User {
        if (userId !== modifiedBy) {
            this.validateUserIsAdmin(modifiedBy, () => new YouHaveToBeAdminToEditAnotherUser());
        }
        this.validateUserIsActiveById(userId);

        const oldUser = this.getUserById(userId);
        if (name !== undefined) {
            this.validateNameNotTakenByAnotherUser(name, userId);
            this.userRepository.updateUserName(userId, name, modifiedBy);
        }
        if (telegramUsername !== undefined) {
            this.validateTelegramUsernameNotTakenByAnotherUser(telegramUsername, userId);
            this.userRepository.updateUserTelegramUsername(userId, telegramUsername, modifiedBy);
        }
        const newUser = this.getUserById(userId);
        this.logEditedUser(oldUser, newUser, modifiedBy);
        return newUser;
    }

    updateUserActivationStatus(userId: number, isActive: boolean, modifiedBy: number): User {
        this.validateUserExistsById(userId);
        this.authorizeUserActivationChange(userId, isActive, modifiedBy);

        const oldUser = this.getUserById(userId);
        this.userRepository.updateUserStatus(userId, isActive, isActive ? 'ACTIVE' : 'INACTIVE', modifiedBy);

        const newUser = this.getUserById(userId);
        this.logActivationStatusChanged(oldUser, newUser, modifiedBy);

        return newUser;
    }

    private authorizeUserActivationChange(targetUserId: number, isActive: boolean, actingUserId: number): void {
        const actingUser = this.getUserById(actingUserId);
        if (actingUser.isAdmin) {
            return;
        }

        const targetMemberships = this.clubMembershipRepository.findActiveMembershipsByUserId(targetUserId);
        const allowedRoles: ClubRole[] = isActive ? ['OWNER', 'MODERATOR'] : ['OWNER'];

        const hasRequiredRoleInSharedClub = targetMemberships.some(membership => {
            const roleInClub = this.clubMembershipRepository.getUserClubRole(membership.clubId, actingUserId);
            return roleInClub !== undefined && allowedRoles.includes(roleInClub);
        });

        if (!hasRequiredRoleInSharedClub) {
            throw new InsufficientPermissionsError();
        }
    }

    validateUserIsAdmin(id: number, insufficientPermissionsError: () => ResponseStatusError): void {
        const user = this.getUserById(id);
        if (!user.isAdmin) {
            throw insufficientPermissionsError();
        }
        if (!user.isActive) {
            throw new UserIsNotActive(id);
        }
    }

    validateUserExistsById(id: number): void {
        const userExists = this.userExistsById(id);
        if (!userExists) {
            throw new UserNotFoundById(id);
        }
    }

    validateUserIsActiveById(id: number): void {
        const user = this.getUserById(id);
        if (!user.isActive) {
            throw new UserIsNotActive(id);
        }
    }

    private applyProfileVisibility(user: User, requestingUserId?: number): User {
        if (
            user.profile?.hideProfile &&
            requestingUserId !== undefined &&
            requestingUserId !== user.id
        ) {
            const requestingUser = this.userRepository.findUserById(requestingUserId);
            if (!requestingUser?.isAdmin) {
                return { ...user, profile: null };
            }
        }
        return user;
    }

    private userExistsByName(name: string): boolean {
        const user = this.userRepository.findUserByName(name);
        return !!user;
    }

    private userExistsByTelegramUsername(telegramUsername: string): boolean {
        const user = this.userRepository.findUserByTelegramUsername(telegramUsername);
        return !!user;
    }

    private userExistsById(id: number): boolean {
        const user = this.userRepository.findUserById(id);
        return !!user;
    }

    private userExistsByTelegramId(telegramId: number): boolean {
        const user = this.userRepository.findUserByTelegramId(telegramId);
        return !!user;
    }

    private validateNameNotTakenByAnotherUser(name: string, userId: number): void {
        const existingUser = this.userRepository.findUserByName(name);
        if (existingUser !== undefined && existingUser.id !== userId) {
            throw new NameAlreadyTakenByAnotherUser(name);
        }
    }

    private validateTelegramUsernameNotTakenByAnotherUser(telegramUsername: string, userId: number): void {
        const existingUser = this.userRepository.findUserByTelegramUsername(telegramUsername);
        if (existingUser !== undefined && existingUser.id !== userId) {
            throw new TelegramUsernameAlreadyTakenByAnotherUser(telegramUsername);
        }
    }

    private logRegisteredUser(user: User, createdBy: number): void {
        const creator = this.getUserById(createdBy);
        this.logMessageToUserLogsTopics(user, locale => {
            const tr = (key: string) => t(key, {}, locale);
            const na = tr('telegram.userLog.noValue');
            return dedent`
                <b>${tr('telegram.userLog.registeredTitle')}</b>

                <b>${tr('telegram.userLog.userIdLabel')}</b> <code>${user.id}</code>
                <b>${tr('telegram.userLog.nameLabel')}</b> ${user.name}
                <b>${tr('telegram.userLog.telegramUsernameLabel')}</b> ${user.telegramUsername || na}
                <b>${tr('telegram.userLog.telegramIdLabel')}</b> <code>${user.telegramId || na}</code>
                <b>${tr('telegram.userLog.registeredByLabel')}</b> ${creator.name} <code>(ID: ${creator.id})</code>
            `;
        });
    }

    private logEditedUser(oldUser: User, newUser: User, modifiedBy: number): void {
        const modifier = this.getUserById(modifiedBy);
        this.logMessageToUserLogsTopics(newUser, locale => {
            const tr = (key: string) => t(key, {}, locale);
            const na = tr('telegram.userLog.noValue');
            const changes: string[] = [];
            if (oldUser.name !== newUser.name) {
                changes.push(`<b>${tr('telegram.userLog.nameLabel')}</b> ${oldUser.name} → ${newUser.name}`);
            }
            if (oldUser.telegramUsername !== newUser.telegramUsername) {
                changes.push(
                    `<b>${tr('telegram.userLog.telegramUsernameLabel')}</b> ${oldUser.telegramUsername || na} → ${
                        newUser.telegramUsername || na
                    }`
                );
            }

            let message = dedent`
                <b>${tr('telegram.userLog.editedTitle')}</b>

                <b>${tr('telegram.userLog.userIdLabel')}</b> <code>${newUser.id}</code>
            `;
            if (changes.length > 0) {
                message += '\n' + changes.join('\n');
            }
            message += `\n<b>${
                tr('telegram.userLog.editedByLabel')
            }</b> ${modifier.name} <code>(ID: ${modifier.id})</code>`;
            return message;
        });
    }

    private logActivationStatusChanged(oldUser: User, newUser: User, modifiedBy: number): void {
        const modifier = this.getUserById(modifiedBy);
        this.logMessageToUserLogsTopics(newUser, locale => {
            const tr = (key: string) => t(key, {}, locale);
            const na = tr('telegram.userLog.noValue');
            const title = newUser.isActive
                ? tr('telegram.userLog.activatedTitle')
                : tr('telegram.userLog.deactivatedTitle');
            return dedent`
                <b>${title}</b>

                <b>${tr('telegram.userLog.userIdLabel')}</b> <code>${newUser.id}</code>
                <b>${tr('telegram.userLog.nameLabel')}</b> ${newUser.name}
                <b>${tr('telegram.userLog.telegramUsernameLabel')}</b> ${newUser.telegramUsername || na}
                <b>${tr('telegram.userLog.isActiveLabel')}</b> ${oldUser.isActive} → ${newUser.isActive}
                <b>${tr('telegram.userLog.statusLabel')}</b> ${oldUser.status} → ${newUser.status}
                <b>${tr('telegram.userLog.updatedByLabel')}</b> ${modifier.name} <code>(ID: ${modifier.id})</code>
            `;
        });
    }

    private logMessageToUserLogsTopics(user: User, buildMessage: (locale: SupportedLocale) => string) {
        this.clubMembershipRepository.findActiveMembershipsByUserId(user.id).forEach(clubMembership => {
            const locale = resolveClubLocale(this.clubService.getClubById(clubMembership.clubId));
            LogService.logInfo(
                buildMessage(locale),
                this.clubService.getClubTelegramTopics(clubMembership.clubId).userLogs
            );
        });
        LogService.logInfo(buildMessage(GLOBAL_LOGS_LOCALE), globalUserLogsTopic);
    }
}
