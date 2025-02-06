const sqlite3 = require('sqlite3').verbose();

const ID_LENGH = 4

module.exports = class DatabaseManager {
    #db;
    constructor() {
        this.#db = require("../../config/db");
    }

    async select_by_userID(user_id) {
        return new Promise((resolve, reject) => {
            this.#db.get(
                `SELECT * FROM player WHERE user_id = ?`,
                [user_id],
                (err, result) => {
                    if (err) {
                        reject(err.message);
                    } else {
                        resolve(result);
                    }
                }
            );
        });
    }

    async select_by_telegram_id(user_telegram_id){
        return new Promise((resolve, reject) => {
            this.#db.get(
                `SELECT * FROM player WHERE user_telegram_userid = ?`,
                [user_telegram_id],
                (err, result) => {
                    if (err) {
                        reject(err.message);
                    } else {
                        resolve(result)
                    }
                }
            )
        })
    }


    async register(user_id, user_name, user_telegram_nickname, user_telegram_id, modified_by) {
        return new Promise((resolve, reject) => {
            this.#db.run(
                `INSERT INTO player (user_id, user_name, user_telegram_nickname, user_telegram_userid, modified_by) VALUES (?, ?, ?, ?, ?)`,
                [user_id, user_name, user_telegram_nickname, user_telegram_id, modified_by],
                (err) => {
                    if (err) {
                        reject(err.message);
                    } else {
                        resolve(true);
                    }
                }
            );
        });
    }

    async edit(user_id, updateField, updateInfo, modified_by){
        return new Promise((resolve, reject) => {
            this.#db.run(
                `UPDATE player 
                    SET ${updateField} = ?, modified_by = ?, modified_at = CURRENT_TIMESTAMP 
                    WHERE user_id = ? 
                    AND EXISTS (
                        SELECT 1 FROM player WHERE user_id = ? AND is_admin = 1
                    );`,
                [updateInfo, modified_by, user_id, modified_by],
                (err) => {
                    if(err){
                        reject(err.message);
                    } else {
                        resolve(true);
                    }
                }
            )
        })
    }

    async registration(user_name, user_telegram_nickname, user_telegram_id, modified_by) {
        try {
            const user_id = user_telegram_id.toString().slice(5,9); 
            const is_user_exist = await this.select_by_telegram_id(user_telegram_id);
            console.log("Register:", user_id, is_user_exist, user_name, user_telegram_id, user_telegram_nickname);
            if (!is_user_exist) {
                const result = await this.register(Number(user_id), user_name, user_telegram_nickname, user_telegram_id, modified_by);
                return result;
            }
            return 400;
        } catch (error) {
            console.error("Ошибка регистрации:", error);
            return 400;
        }
    }

    async edit_user(user_id, updateField, updateInfo, modified_by){
        try{
            console.log("Edit:", user_id, updateField, updateInfo, modified_by);
            const is_user_exist = await this.select_by_userID(user_id)
            if(is_user_exist){
                const result = await this.edit(user_id, updateField, updateInfo, modified_by);
                return result;
            }
            return false
        }
        catch(error){
            console.error(error);
            return false
        }
    }
};
