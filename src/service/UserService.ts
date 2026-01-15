import { UserRepository } from '../repository/UserRepository.ts';
import {
    UserIsNotAdmin,
    UserNotFoundById,
    UserNotFoundByTelegramId,
    UserWithThisNameAlreadyExists,
    UserWithThisTelegramIdAlreadyExists,
    UserWithThisTelegramUsernameAlreadyExists,
    UserIsNotActive
} from '../error/UserErrors.ts';
import type { User } from '../model/UserModels.ts';

export class UserService {

    private userRepository: UserRepository = new UserRepository();

    registerUser(
        userName: string,
        userTelegramUsername: string | undefined,
        userTelegramId: number | undefined,
        createdBy: number
    ): User {
        if (this.userExistsByName(userName)) {
            throw new UserWithThisNameAlreadyExists(userName);
        }
        if (userTelegramId !== undefined && this.userExistsByTelegramId(userTelegramId)) {
            throw new UserWithThisTelegramIdAlreadyExists(userTelegramId);
        }
        if (userTelegramUsername !== undefined && this.userExistsByTelegramUsername(userTelegramUsername)) {
            throw new UserWithThisTelegramUsernameAlreadyExists(userTelegramUsername);
        }

        const newUserId = this.userRepository.registerUser(userName, userTelegramUsername, userTelegramId, createdBy);
        return this.getUserById(newUserId);
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

    findUserByTelegramId(telegramId: number): User | undefined {
        return this.userRepository.findUserByTelegramId(telegramId);
    }

    findUserByTelegramUsername(telegramUsername: string): User | undefined {
        return this.userRepository.findUserByTelegramUsername(telegramUsername);
    }

    linkTelegramIdToUser(userId: number, telegramId: number): User {
        this.userRepository.updateUserTelegramId(userId, telegramId, 0);
        return this.getUserById(userId);
    }

    editUser(
        userId: number,
        name: string | undefined,
        telegramUsername: string | undefined,
        modifiedBy: number
    ): User {
        if (userId !== modifiedBy) {
            this.validateUserIsAdmin(modifiedBy);
        }
        this.validateUserIsActiveById(userId);

        if (name !== undefined) {
            this.userRepository.updateUserName(userId, name, modifiedBy);
        }
        if (telegramUsername !== undefined) {
            this.userRepository.updateUserTelegramUsername(userId, telegramUsername, modifiedBy);
        }
        return this.getUserById(userId);
    }

    updateUserActivationStatus(userId: number, isActive: boolean, modifiedBy: number): User {
        this.validateUserExistsById(userId);

        this.userRepository.updateUserActivationStatus(userId, isActive, modifiedBy);
        return this.getUserById(userId);
    }

    validateUserIsAdmin(id: number): void {
        const user = this.getUserById(id);
        if (!user.isAdmin) {
            throw new UserIsNotAdmin(id);
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
}