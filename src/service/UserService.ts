import { UserRepository } from '../repository/UserRepository.ts';
import {
    UserNotFoundById,
    UserNotFoundByTelegramId,
    UserWithThisTelegramIdAlreadyExists,
    UserIsNotActive,
    NameAlreadyTakenByAnotherUser,
    TelegramUsernameAlreadyTakenByAnotherUser,
    YouHaveToBeAdminToEditAnotherUser
} from '../error/UserErrors.ts';
import type { User, UserStatus } from '../model/UserModels.ts';
import { ResponseStatusError } from '../error/BaseErrors.ts';
import LogService from './LogService.ts';
import TelegramService from './TelegramSevice.ts';
import config from '../../config/config.ts';
import dedent from 'dedent';
import { UserLogsTopic } from '../model/TelegramTopic.ts';

export class UserService {

    private userRepository: UserRepository = new UserRepository();

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

    getAllUsers(requestingUserId?: number): User[] {
        const users = this.userRepository.findAllUsers();
        return users.map(user => this.applyProfileVisibility(user, requestingUserId));
    }

    getUserById(id: number, requestingUserId?: number): User {
        const user = this.userRepository.findUserById(id);
        if (!user) {
            throw new UserNotFoundById(id);
        }
        return this.applyProfileVisibility(user, requestingUserId);
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

        const oldUser = this.getUserById(userId);
        this.userRepository.updateUserStatus(userId, isActive, isActive ? 'ACTIVE' : 'INACTIVE', modifiedBy);

        const newUser = this.getUserById(userId);
        this.logActivationStatusChanged(oldUser, newUser, modifiedBy);

        if (isActive && newUser.telegramId) {
            this.notifyUserActivated(newUser);
        }

        return newUser;
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
        const message = dedent`
            <b>👤 New User Registered</b>

            <b>User ID:</b> <code>${user.id}</code>
            <b>Name:</b> ${user.name}
            <b>Telegram Username:</b> ${user.telegramUsername || 'N/A'}
            <b>Telegram ID:</b> <code>${user.telegramId || 'N/A'}</code>
            <b>Registered by:</b> ${creator.name} <code>(ID: ${creator.id})</code>
        `;
        LogService.logInfo(message, UserLogsTopic);
    }

    private logEditedUser(oldUser: User, newUser: User, modifiedBy: number): void {
        const modifier = this.getUserById(modifiedBy);
        const message = dedent`
            <b>✏️ User Edited</b>

            <b>User ID:</b> <code>${newUser.id}</code>
            <b>Name:</b> ${oldUser.name} → ${newUser.name}
            <b>Telegram Username:</b> ${oldUser.telegramUsername || 'N/A'} → ${newUser.telegramUsername || 'N/A'}
            <b>Edited by:</b> ${modifier.name} <code>(ID: ${modifier.id})</code>
        `;
        LogService.logInfo(message, UserLogsTopic);
    }

    private notifyUserActivated(user: User): void {
        const message = dedent`
            <b>Ваш акаунт було активовано!</b>

            Тепер ви можете користуватися додатком. <a href="${config.botUrl}">Відкрити</a>
        `;
        TelegramService.sendDirectMessage(user.telegramId!, message);
    }

    private logActivationStatusChanged(oldUser: User, newUser: User, modifiedBy: number): void {
        const modifier = this.getUserById(modifiedBy);
        const statusEmoji = newUser.isActive ? '✅' : '❌';
        const statusText = newUser.isActive ? 'Activated' : 'Deactivated';
        const message = dedent`
            <b>${statusEmoji} User ${statusText}</b>

            <b>User ID:</b> <code>${newUser.id}</code>
            <b>Name:</b> ${newUser.name}
            <b>Telegram Username:</b> ${newUser.telegramUsername || 'N/A'}
            <b>Is active:</b> ${oldUser.isActive} → ${newUser.isActive}
            <b>Status:</b> ${oldUser.status} → ${newUser.status}
            <b>Updated by:</b> ${modifier.name} <code>(ID: ${modifier.id})</code>
        `;
        LogService.logInfo(message, UserLogsTopic);
    }
}