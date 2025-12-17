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
    private userRepository: UserRepository;

    constructor() {
        this.userRepository = new UserRepository();
    }

    async registerUser(
        userName: string,
        userTelegramUsername: string,
        userTelegramId: number,
        modifiedBy: number
    ): Promise<User> {
        if (await this.userExistsByName(userName)) {
            throw new UserWithThisNameAlreadyExists(userName);
        }
        if (await this.userExistsByTelegramId(userTelegramId)) {
            throw new UserWithThisTelegramIdAlreadyExists(userTelegramId);
        }
        if (await this.userExistsByTelegramUsername(userTelegramUsername)) {
            throw new UserWithThisTelegramUsernameAlreadyExists(userTelegramUsername);
        }

        await this.userRepository.registerUser(userName, userTelegramUsername, userTelegramId, modifiedBy);
        return await this.getUserByTelegramId(userTelegramId);
    }

    async getAllUsers(): Promise<User[]> {
        return await this.userRepository.findAllUsers();
    }

    async getUserById(id: number): Promise<User> {
        const user = await this.userRepository.findUserBy('id', id);
        if (!user) {
            throw new UserNotFoundById(id);
        }
        return user;
    }

    async getUserByTelegramId(telegramId: number): Promise<User> {
        const user = await this.userRepository.findUserBy('telegram_id', telegramId);
        if (!user) {
            throw new UserNotFoundByTelegramId(telegramId);
        }
        return user;
    }

    async editUser(
        userId: number,
        name: string | undefined,
        telegramUsername: string | undefined,
        modifiedBy: number
    ): Promise<User> {
        await this.validateUserIsAdmin(modifiedBy);
        await this.validateUserExistsById(userId);

        if (name !== undefined) {
            await this.userRepository.editUser(userId, 'name', name, modifiedBy);
        }
        if (telegramUsername !== undefined) {
            await this.userRepository.editUser(userId, 'telegram_username', telegramUsername, modifiedBy);
        }
        return await this.getUserById(userId);
    }

    async updateUserActivationStatus(userId: number, isActive: boolean, modifiedBy: number): Promise<User> {
        await this.validateUserIsAdmin(modifiedBy);
        await this.validateUserExistsById(userId);

        await this.userRepository.updateUserActivationStatus(userId, isActive, modifiedBy);
        return await this.getUserById(userId);
    }

    async validateUserIsAdmin(id: number): Promise<void> {
        const user = await this.getUserById(id);
        if (!user.is_admin) {
            throw new UserIsNotAdmin(id);
        }
    }

    async validateUserExistsById(id: number): Promise<void> {
        const userExists = await this.userExistsById(id);
        if (!userExists) {
            throw new UserNotFoundById(id);
        }
    }

    private async userExistsByName(name: string): Promise<boolean> {
        const user = await this.userRepository.findUserBy('name', name);
        return !!user;
    }

    private async userExistsByTelegramUsername(telegramUsername: string): Promise<boolean> {
        const user = await this.userRepository.findUserBy('telegram_username', telegramUsername);
        return !!user;
    }

    private async userExistsById(id: number): Promise<boolean> {
        const user = await this.userRepository.findUserBy('id', id);
        return !!user;
    }

    async resolveUser(unresolvedUser: UnresolvedUserInfo): Promise<ResolvedUserInfo> {
        if (unresolvedUser.telegramUsername) {
            let user = await this.findUserByTelegramUsernameOrThrow(unresolvedUser.telegramUsername);
            return {
                id: user.id,
                telegramUsername: unresolvedUser.telegramUsername
            };
        } else if (unresolvedUser.name) {
            let user = await this.findUserByNameOrThrow(unresolvedUser.name);
            return {
                id: user.id,
                name: unresolvedUser.name
            };
        }
        else {
            throw new MissingUserInformationError();
        }
    }

    private async findUserByTelegramUsernameOrThrow(telegramUsername: string): Promise<User> {
        let user = await this.userRepository.findUserBy('telegram_username', telegramUsername);
        if (!user) {
            throw new UserNotFoundByTelegramUsername(telegramUsername);
        }
        return user;
    }

    private async findUserByNameOrThrow(name: string): Promise<User> {
        let user = await this.userRepository.findUserBy('name', name);
        if (!user) {
            throw new UserNotFoundByName(name);
        }
        return user;
    }

    private async userExistsByTelegramId(telegramId: number): Promise<boolean> {
        const user = await this.userRepository.findUserBy('telegram_id', telegramId);
        return !!user;
    }
}