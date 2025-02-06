const sqlite3 = require('sqlite3').verbose();

const ID_LENGH = 4

module.exports = class DatabaseManager {
    #db;
    constructor() {
        this.#db = require("../../config/db");
    }

    async select_by_telegram(user_telegram) {
        return new Promise((resolve, reject) => {
            this.#db.get(
                `SELECT * FROM players WHERE user_telegram = ?`,
                [user_telegram],
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

    #registration(user_id, user_name, user_telegram, modified_by) {
        return new Promise((resolve, reject) => {
            this.#db.run(
                `INSERT INTO players (user_id, user_name, user_telegram, modified_by) VALUES (?, ?, ?, ?)`,
                [user_id, user_name, user_telegram, modified_by],
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

    async registration(user_name, user_telegram, modified_by, user_id) {
        if(!user_id){
            user_id = this.generateRandomId();
        }
        try {
            const is_user_exist = await this.select_by_telegram(user_telegram);
            if (!is_user_exist) {
                const result = await this.#registration(user_id, user_name, user_telegram, modified_by);
                return result;
            }
            return 400;
        } catch (error) {
            console.error("Ошибка регистрации:", error.message);
            return 500;
        }
    }


// Убрать
    generateRandomId() {
        const numbers = '0123456789';
        let id = '';

        for (let i = 0; i < ID_LENGH; i++) {
            id += numbers.charAt(Math.floor(Math.random() * numbers.length));
        }
        return id;
    }
};
