import DatabaseManager from '../db/dbManager.js';
import { DatabaseError } from '../error/errors.ts';
import type { User } from './UserModels.ts';

export class UserRepository {
    private dbManager: DatabaseManager;

    constructor() {
        this.dbManager = new DatabaseManager();
    }

    async findAllUsers(): Promise<User[]> {
        return await this.dbManager.all('SELECT * FROM user ORDER BY id');
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

    async editUser(userId: number, column: string, value: any, modifiedBy: number): Promise<void> {
        await this.dbManager.run(
            `UPDATE user
             SET ${column} = ?, modified_by = ?, modified_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [value, modifiedBy, userId]
        );
    }

    async updateUserActivationStatus(userId: number, newStatus: boolean, modifiedBy: number): Promise<void> {
        await this.dbManager.run(
            `UPDATE user
             SET is_active = ?, modified_by = ?, modified_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [newStatus, modifiedBy, userId]
        )
    }
}