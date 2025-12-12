import DatabaseManager from '../db/dbManager.js';
import { DatabaseError } from '../error/errors.ts';
import type { User } from './UserModels.ts';

export class UserRepository {
    private dbManager: DatabaseManager;

    constructor() {
        this.dbManager = new DatabaseManager();
    }

    async findUserBy(column: string, value: any): Promise<User | null> {
        if (!column || value === undefined || value === null) {
            throw new DatabaseError("Invalid search parameters");
        }
        return await this.dbManager.get(`SELECT * FROM user WHERE ${column} = ?`, [value]);
    }

    async registerUser(userName: string, userTelegramUsername: string, userTelegramId: number, modifiedBy: number): Promise<void> {
        await this.dbManager.run(
            `INSERT INTO user (name, telegram_username, telegram_id, modified_by) 
             VALUES (?, ?, ?, ?)`,
            [userName, userTelegramUsername, userTelegramId, modifiedBy]
        );
    }

    async editUser(column: string, value: any, userTelegramId: number, modifiedBy: number): Promise<void> {
        await this.dbManager.run(
            `UPDATE user
             SET ${column} = ?, modified_by = ?, modified_at = CURRENT_TIMESTAMP
             WHERE telegram_id = ?`,
            [value, modifiedBy, userTelegramId]
        );
    }

    async updateUserActivationStatus(userTelegramId: number, newStatus: boolean, modifiedBy: number): Promise<void> {
        await this.dbManager.run(
            `UPDATE user
             SET is_active = ?, modified_by = ?, modified_at = CURRENT_TIMESTAMP
             WHERE telegram_id = ?`,
            [newStatus, modifiedBy, userTelegramId]
        )
    }
}