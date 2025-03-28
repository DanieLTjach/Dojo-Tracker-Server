const sqlite3 = require('sqlite3').verbose();

module.exports = class DatabaseManager {
    #db;
    constructor() {
        this.#db = require("./db_init");
    }    

    async register(user_id, user_name, user_telegram_nickname, user_telegram_id, modified_by){
        return new Promise((resolve, reject) => {
            this.#db.run(
                `INSERT INTO player (user_id, user_name, user_telegram_nickname, user_telegram_id, modified_by) 
                 VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT (user_id) DO NOTHING`,
                [user_id, user_name, user_telegram_nickname, user_telegram_id, modified_by],
                (err) => {
                    if(err){
                        console.error('Registration error:', err);
                        reject({success: false, result: err.message});
                    }
                    else if(this.changes === 0){
                        console.warn('User registration conflict');
                        resolve({success: false, result: "User already exists"});
                    }
                    else {
                        resolve({success: true, result: "User added"});
                    }
                }
            );
        });
    }

    async player_select_by(column, value){
        return new Promise((resolve, reject) => {
            if (!column || !value) {
                reject({success: false, result: "Invalid search parameters"});
                return;
            }
    
            const query = `SELECT * FROM player WHERE ${column} = ?`;
            
            this.#db.get(query, [value], (err, result) => {
                if(err){
                    console.error('Database select error:', err);
                    reject({success: false, result: err.message});
                    return;
                } 
                if(result === undefined){
                    resolve({success: false, result: null});
                } 
                else{
                    resolve({success: true, result: result});
                }
            });
        });
    }

    // Edit / Update 

    async user_edit(column, value, user_id, modified_by){
        return new Promise((resolve, reject) => {
            this.#db.run(
                `UPDATE player
                    SET ${column} = ?, modified_by = ?, modified_at = CURRENT_TIMESTAMP
                    WHERE user_id = ?
                    AND EXISTS (
                        SELECT 1 FROM player WHERE user_id = ? AND is_admin = 1
                    );
                `,
                [value, modified_by, user_id, modified_by],
                (err) => {
                    if(err){
                        reject({success: false, result: err.message});
                    }
                    else if(this.changes === 0){
                        reject({success: false, result: "You are not admin."})
                    } 
                    else {
                        resolve({success: true, result: "User edited."});
                    }
                }
            )
        })
    }

    // Remove / Delete

    async remove_user(user_id, modified_by) {
        return new Promise((resolve, reject) => {
            this.#db.run(
                `UPDATE player
                    SET is_active = 0, modified_by = ?
                    WHERE user_id = ?
                    AND EXISTS (
                        SELECT 1 FROM player WHERE user_id = ? AND is_admin = 1
                    );
                `,
                [modified_by, user_id, modified_by],
                (err) => {
                    if(err){
                        reject({success: false, result: err.message});
                    }
                    else if(this.changes === 0){
                        reject({success: false, result: "You are not admin."})
                    }
                    else{
                        resolve({success: true, result: "User deactivated."});
                    }
                }
            )
        })
    }
};
