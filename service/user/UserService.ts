import { UserRepository } from './UserRepository.ts';
import { UserIsNotAdmin, UserNotFoundById, UserNotFoundByTelegramId, UserWithTelegramIdAlreadyExists } from './UserErrors.ts';
import type { User } from './UserModels.ts';

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
        if (await this.userExistsByTelegramId(userTelegramId)) {
            throw new UserWithTelegramIdAlreadyExists(userTelegramId);
        }

        await this.userRepository.registerUser(userName, userTelegramUsername, userTelegramId, modifiedBy);
        return await this.getUserByTelegramId(userTelegramId);
    }

    async editUser(
        userTelegramId: number,
        name: string | undefined,
        telegramUsername: string | undefined,
        modifiedBy: number
    ): Promise<User> {
        await this.validateUserIsAdmin(modifiedBy);
        await this.validateUserExistsByTelegramId(userTelegramId);

        if (name !== undefined) {
            await this.userRepository.editUser('name', name, userTelegramId, modifiedBy);
        }
        if (telegramUsername !== undefined) {
            await this.userRepository.editUser('telegram_username', telegramUsername, userTelegramId, modifiedBy);
        }
        return await this.getUserByTelegramId(userTelegramId);
    }

    async updateUserActivationStatus(userTelegramId: number, isActive: boolean, modifiedBy: number): Promise<User> {
        await this.validateUserIsAdmin(modifiedBy);
        await this.validateUserExistsByTelegramId(userTelegramId);

        await this.userRepository.updateUserActivationStatus(userTelegramId, isActive, modifiedBy);
        return await this.getUserByTelegramId(userTelegramId);
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

    async validateUserExistsByTelegramId(telegramId: number): Promise<void> {
        if (!this.userExistsByTelegramId(telegramId)) {
            throw new UserNotFoundByTelegramId(telegramId);
        }
    }

    async userExistsByTelegramId(telegramId: number): Promise<boolean> {
        const user = await this.userRepository.findUserBy('telegram_id', telegramId);
        return !!user;
    }

    async validateUserIsAdmin(id: number): Promise<void> {
        const user = await this.getUserById(id);
        if (!user.is_admin) {
            throw new UserIsNotAdmin(id);
        }
    }
}