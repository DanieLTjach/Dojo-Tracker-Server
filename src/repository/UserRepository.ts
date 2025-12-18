import type { Statement } from 'better-sqlite3';
import type { User } from '../model/UserModels.ts';
import { db } from '../db/dbInit.ts';
import { booleanToInteger } from '../db/dbUtils.ts';

export class UserRepository {

    private findAllUsersStatement: Statement<unknown[], User> =
        db.prepare('SELECT * FROM user ORDER BY id');

    findAllUsers(): User[] {
        return this.findAllUsersStatement.all();
    }

    private findUserByIdStatement: Statement<{ id: number }, User> =
        db.prepare('SELECT * FROM user WHERE id = :id');

    findUserById(id: number): User | undefined {
        return this.findUserByIdStatement.get({ id });
    }

    private findUserByTelegramIdStatement: Statement<{ telegramId: number }, User> =
        db.prepare('SELECT * FROM user WHERE telegram_id = :telegramId');

    findUserByTelegramId(telegramId: number): User | undefined {
        return this.findUserByTelegramIdStatement.get({ telegramId });
    }

    private findUserByTelegramUsernameStatement: Statement<{ telegramUsername: string }, User> =
        db.prepare('SELECT * FROM user WHERE telegram_username = :telegramUsername');

    findUserByTelegramUsername(telegramUsername: string): User | undefined {
        return this.findUserByTelegramUsernameStatement.get({ telegramUsername: telegramUsername });
    }

    private findUserByNameStatement: Statement<{ name: string }, User> =
        db.prepare('SELECT * FROM user WHERE name = :name');
    findUserByName(name: string): User | undefined {
        return this.findUserByNameStatement.get({ name });
    }

    private registerUserStatement: Statement<{
        name: string,
        telegramUsername: string,
        telegramId: number,
        modifiedBy: number 
    }, void> = db.prepare(
        `INSERT INTO user (name, telegram_username, telegram_id, modified_by) 
         VALUES (:name, :telegramUsername, :telegramId, :modifiedBy)`
    );

    registerUser(name: string, telegramUsername: string, telegramId: number, modifiedBy: number) {
        this.registerUserStatement.run({ name, telegramUsername, telegramId, modifiedBy });
    }

    private updateUserNameStatement: Statement<{
        name: string,
        modifiedBy: number,
        id: number
    }, void> = db.prepare(
        `UPDATE user
         SET name = :name, modified_by = :modifiedBy, modified_at = CURRENT_TIMESTAMP
         WHERE id = :id`
    );
    
    updateUserName(userId: number, name: string, modifiedBy: number) {
        this.updateUserNameStatement.run({ name, modifiedBy, id: userId });
    }

    private updateUserTelegramUsernameStatement: Statement<{
        telegramUsername: string,
        modifiedBy: number,
        id: number
    }, void> = db.prepare(
        `UPDATE user
         SET telegram_username = :telegramUsername, modified_by = :modifiedBy, modified_at = CURRENT_TIMESTAMP
         WHERE id = :id`
    );

    updateUserTelegramUsername(userId: number, telegramUsername: string, modifiedBy: number) {
        this.updateUserTelegramUsernameStatement.run({ telegramUsername, modifiedBy, id: userId });
    }

    private updateUserActivationStatusStatement: Statement<{
        isActive: number,
        modifiedBy: number,
        id: number
    }, void> = db.prepare(
        `UPDATE user
         SET is_active = :isActive, modified_by = :modifiedBy, modified_at = CURRENT_TIMESTAMP
         WHERE id = :id`
    );

    updateUserActivationStatus(userId: number, newStatus: boolean, modifiedBy: number) {
        this.updateUserActivationStatusStatement.run({ isActive: booleanToInteger(newStatus), modifiedBy, id: userId });
    }
}