import db from './dbInit.js';
import { DatabaseError } from '../error/BaseErrors.ts';

export default class DatabaseManager {
    #db;
    constructor() {
        this.#db = db;
    }

    run(query, params = []) {
        return new Promise((resolve, reject) => {
            this.#db.run(query, params, (err) => {
                if (err) {
                    reject(new DatabaseError(err.message));
                }
                else {
                    resolve();
                }
            });
        });
    }

    get(query, params = []) {
        return new Promise((resolve, reject) => {
            this.#db.get(query, params, (err, result) => {
                if (err) {
                    reject(new DatabaseError(err.message));
                } else {
                    resolve(result);
                }
            });
        });
    }

    all(query, params = []) {
        return new Promise((resolve, reject) => {
            this.#db.all(query, params, (err, rows) => {
                if (err) {
                    reject(new DatabaseError(err.message));
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async addClub(club_name, modified_by) {
        return new Promise((resolve, reject) => {
            this.#db.run(
                `INSERT INTO club (name, modified_by) VALUES (?, ?)`,
                [club_name, modified_by],
                function (err) {
                    if (err) {
                        console.error('Database error:', err);
                        reject({ success: false, result: err.message });
                    } else {
                        resolve({ success: true, result: "Club added successfully", id: this.lastID });
                    }
                }
            )
        })
    };

    async add_event(name, type, date_from, date_to, modified_by) {
        return new Promise((resolve, reject) => {
            this.#db.run(
                `INSERT INTO event (name, type, date_from, date_to, modified_by) VALUES (?, ?, ?, ?, ?)`,
                [name, type, date_from, date_to, modified_by],
                function (err) {
                    if (err) {
                        console.error('Database error:', err);
                        reject({ success: false, result: err.message });
                    } else {
                        resolve({ success: true, result: "Event added successfully", id: this.lastID });
                    }
                }
            );
        });
    }

    async add_achievement(name, description, modified_by) {
        return new Promise((resolve, reject) => {
            this.#db.run(
                `INSERT INTO achievements (name, description, modified_by) 
                 VALUES (?, ?, ?)`,
                [name, description, modified_by],
                function (err) {
                    if (err) {
                        console.error('Database error:', err);
                        reject({ success: false, result: err.message });
                    } else {
                        resolve({ success: true, result: "Achievement added successfully", id: this.lastID });
                    }
                }
            );
        })
    }

    async grant_achievement(user_id, achievement_id, modified_by) {
        return new Promise((resolve, reject) => {
            this.#db.run(
                `INSERT INTO user_to_achievements (user_id, achievement_id, modified_by) 
                 VALUES (?, ?, ?)`,
                [user_id, achievement_id, modified_by],
                function (err) {
                    if (err) {
                        console.error('Database error:', err);
                        reject({ success: false, result: err.message });
                    } else {
                        resolve({ success: true, result: "Achievement granted successfully", id: this.lastID });
                    }
                }
            );
        });
    }

    async list_achievements() {
        return new Promise((resolve, reject) => {
            this.#db.all(
                `SELECT * FROM achievements`,
                (err, rows) => {
                    if (err) {
                        console.error('Database error:', err);
                        reject({ success: false, result: err.message });
                    } else if (rows.length === 0) {
                        resolve({ success: false, result: "No achievements found" });
                    } else {
                        resolve({ success: true, result: rows });
                    }
                }
            );
        });
    }

    async user_achievements(user_id) {
        return new Promise((resolve, reject) => {
            this.#db.all(
                `SELECT a.* FROM user_to_achievements uta
                 JOIN achievements a ON uta.achievement_id = a.id
                 WHERE uta.user_id = ?`,
                [user_id],
                (err, rows) => {
                    if (err) {
                        console.error('Database error:', err);
                        reject({ success: false, result: err.message });
                    } else if (rows.length === 0) {
                        resolve({ success: false, result: "No achievements found for user" });
                    } else {
                        resolve({ success: true, result: rows });
                    }
                }
            );
        });
    }

    async findUserBy(column, value) {
        if (!column || value === undefined || value === null) {
            throw new DatabaseError("Invalid search parameters");
        }
        return await this.get(`SELECT * FROM user WHERE ${column} = ?`, [value]);
    }

    async custom_select(query, params = []) {
        return new Promise((resolve, reject) => {
            this.#db.all(query, params, (err, rows) => {
                if (err) {
                    console.error('Database custom select error:', err);
                    reject({ success: false, result: err.message });
                } else if (rows.length === 0) {
                    console.log(rows)
                    resolve({ success: false, result: "No results found" });
                } else {
                    console.log(rows)
                    resolve({ success: true, result: rows });
                }
            });
        });
    }

    // Edit / Update 

    async editClub(club_id, column, value, modified_by) {
        return new Promise((resolve, reject) => {
            this.#db.run(
                `UPDATE club
                    SET ${column} = ?, modified_by = ?
                    WHERE id = ?
                    AND EXISTS (
                        SELECT 1 FROM user WHERE id = ? AND is_admin = 1
                    );
                `,
                [value, modified_by, club_id, modified_by],
                (err) => {
                    if (err) {
                        reject({ success: false, result: err.message });
                    }
                    else if (this.changes === 0) {
                        reject({ success: false, result: "You are not admin." })
                    }
                    else {
                        resolve({ success: true, result: "Club edited." });
                    }
                }
            )
        });
    } 

    // Remove / Delete

    removeClub(club_id, modified_by) {
        return new Promise((resolve, reject) => {
            this.#db.run(
                `DELETE FROM club
                 WHERE id = ? 
                 AND EXISTS (SELECT 1 FROM user WHERE id = ? AND is_admin = 1)`,
                [club_id, modified_by],
                function (err) {
                    if (err) {
                        reject({ success: false, result: err.message });
                    } else if (this.changes === 0) {
                        resolve({ success: false, result: "You are not admin or club not found." });
                    } else {
                        resolve({ success: true, result: "Club removed." });
                    }
                }
            );
        });
    }
};
