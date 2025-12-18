import { UserRepository } from '../repository/UserRepository.ts';
import {
    UserIsNotAdmin,
    UserNotFoundById,
    UserNotFoundByTelegramId,
    UserWithThisNameAlreadyExists,
    UserWithThisTelegramIdAlreadyExists,
    UserWithThisTelegramUsernameAlreadyExists,
    UserNotFoundByTelegramUsername,
    UserNotFoundByName,
    MissingUserInformationError
} from '../error/UserErrors.ts';
import type { User, UnresolvedUserInfo, ResolvedUserInfo } from '../model/UserModels.ts';

export class UserService {
    
    private userRepository: UserRepository = new UserRepository();

    registerUser(
        userName: string,
        userTelegramUsername: string,
        userTelegramId: number,
        modifiedBy: number
    ): User {
        if (this.userExistsByName(userName)) {
            throw new UserWithThisNameAlreadyExists(userName);
        }
        if (this.userExistsByTelegramId(userTelegramId)) {
            throw new UserWithThisTelegramIdAlreadyExists(userTelegramId);
        }
        if (this.userExistsByTelegramUsername(userTelegramUsername)) {
            throw new UserWithThisTelegramUsernameAlreadyExists(userTelegramUsername);
        }

        this.userRepository.registerUser(userName, userTelegramUsername, userTelegramId, modifiedBy);
        return this.getUserByTelegramId(userTelegramId);
    }

    getAllUsers(): User[] {
        return this.userRepository.findAllUsers();
    }

    getUserById(id: number): User {
        const user = this.userRepository.findUserById(id);
        if (!user) {
            throw new UserNotFoundById(id);
        }
        return user;
    }

    getUserByTelegramId(telegramId: number): User {
        const user = this.userRepository.findUserByTelegramId(telegramId);
        if (!user) {
            throw new UserNotFoundByTelegramId(telegramId);
        }
        return user;
    }

    editUser(
        userId: number,
        name: string | undefined,
        telegramUsername: string | undefined,
        modifiedBy: number
    ): User {
        this.validateUserIsAdmin(modifiedBy);
        this.validateUserExistsById(userId);

        if (name !== undefined) {
            this.userRepository.updateUserName(userId, name, modifiedBy);
        }
        if (telegramUsername !== undefined) {
            this.userRepository.updateUserTelegramUsername(userId, telegramUsername, modifiedBy);
        }
        return this.getUserById(userId);
    }

    updateUserActivationStatus(userId: number, isActive: boolean, modifiedBy: number): User {
        this.validateUserIsAdmin(modifiedBy);
        this.validateUserExistsById(userId);

        this.userRepository.updateUserActivationStatus(userId, isActive, modifiedBy);
        return this.getUserById(userId);
    }

    validateUserIsAdmin(id: number): void {
        const user = this.getUserById(id);
        if (!user.is_admin) {
            throw new UserIsNotAdmin(id);
        }
    }

    validateUserExistsById(id: number): void {
        const userExists = this.userExistsById(id);
        if (!userExists) {
            throw new UserNotFoundById(id);
        }
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

    resolveUser(unresolvedUser: UnresolvedUserInfo): ResolvedUserInfo {
        if (unresolvedUser.telegramUsername) {
            let user = this.findUserByTelegramUsernameOrThrow(unresolvedUser.telegramUsername);
            return {
                id: user.id,
                telegramUsername: unresolvedUser.telegramUsername
            };
        } else if (unresolvedUser.name) {
            let user = this.findUserByNameOrThrow(unresolvedUser.name);
            return {
                id: user.id,
                name: unresolvedUser.name
            };
        }
        else {
            throw new MissingUserInformationError();
        }
    }

    private findUserByTelegramUsernameOrThrow(telegramUsername: string): User {
        let user = this.userRepository.findUserByTelegramUsername(telegramUsername);
        if (!user) {
            throw new UserNotFoundByTelegramUsername(telegramUsername);
        }
        return user;
    }

    private findUserByNameOrThrow(name: string): User {
        let user = this.userRepository.findUserByName(name);
        if (!user) {
            throw new UserNotFoundByName(name);
        }
        return user;
    }

    private userExistsByTelegramId(telegramId: number): boolean {
        const user = this.userRepository.findUserByTelegramId(telegramId);
        return !!user;
    }
}