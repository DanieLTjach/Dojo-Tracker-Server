import sqlite3 from 'sqlite3';
import db from './dbInit.js';
import { DatabaseError } from '../error/errors.ts';

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


    async list_games(type, date_from, date_to, user_id = null, club_id) {
        return new Promise((resolve, reject) => {
            this.#db.all(`SELECT
                g.id,
                g.created_at
                FROM game g
                WHERE g.created_at BETWEEN ? AND ?
                AND g.type = ?
                AND g.club_id = ?
                AND (
                    ? IS NULL OR EXISTS (
                    SELECT 1
                    FROM user_to_game utg
                    WHERE utg.game_id = g.id
                        AND utg.user_id = ?
                    )
                );`, [date_from, date_to, type, club_id, user_id, user_id], (err, rows) => {
                if (err) {
                    console.error('Database error:', err);
                    reject({ success: false, result: err.message });
                } else if (rows.length === 0) {
                    resolve({ success: false, result: "No games found" });
                } else {
                    console.log('Games found:', rows);
                    resolve({ success: true, result: rows });
                }
            });
        });
    }

    async get_game(game_id) {
        return new Promise((resolve, reject) => {
            this.#db.all(
                `SELECT
                    u.name,
                    utg.points,
                    g.created_at
                FROM user_to_game utg
                JOIN user u ON utg.user_id = u.id
                JOIN game g ON utg.game_id = g.id
                WHERE utg.game_id = ?;`,
                [game_id],
                (err, row) => {
                    if (err) {
                        console.error('Database error:', err);
                        reject({ success: false, result: err.message });
                    } else if (!row) {
                        resolve({ success: false, result: "Game not found" });
                    } else {
                        console.log('Game found:', row);
                        resolve({ success: true, result: row });
                    }
                }
            );
        });
    }

    async #insertGame(type, club_id, modified_by, created_at = null) {
        return new Promise((resolve, reject) => {
            this.#db.run(
                `INSERT INTO game (type, club_id, modified_by, created_at) VALUES (?, ?, ?, ?)`,
                [type, club_id, modified_by, created_at || new Date().toISOString().replace('T', ' ').split('.')[0]],
                function (err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.lastID);
                    }
                }
            );
        });
    }

    async #insertPlayer(uid, start_place, points, gameId, modified_by, created_at = null) {
        return new Promise((resolve, reject) => {
            this.#db.run(
                `INSERT INTO user_to_game (user_id, game_id, start_place, points, modified_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
                [uid, gameId, start_place, points, modified_by, created_at || new Date().toISOString().replace('T', ' ').split('.')[0]],
                (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            );
        });
    }

    async #insertEventToGame(event_id, game_id, modified_by) {
        return new Promise((resolve, reject) => {
            this.#db.run(
                `INSERT INTO event_to_game (event_id, game_id, modified_by) VALUES (?, ?, ?)`,
                [event_id, game_id, modified_by],
                function (err) {
                    if (err) {
                        console.error('Database error:', err);
                        reject({ success: false, result: err.message });
                    } else {
                        resolve({ success: true, result: "Event linked to game successfully", id: this.lastID });
                    }
                }
            );
        });
    }

    async add_game(type, players_data, modified_by, created_at = null, club_id, event_id) {
        try {
            const gameId = await this.#insertGame(type, club_id, modified_by, created_at);
            for (const player of players_data) {
                const user = await this.findUserBy("telegram_username", player.user);
                if (user.success && user.result) {
                    const uid = user.result.id;
                    await this.#insertPlayer(uid, player.start_place, player.points, gameId, modified_by, created_at);
                } else {
                    throw new Error(`User ${player.user} not found`);
                }
            }

            return { success: true, result: "Game, players, hanchan, club, and event added successfully" };
        } catch (err) {
            console.error('Database error during game addition:', err);
            return { success: false, result: err.message };
        }
    }

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

    async #removePlayersFromGame(game_id, modified_by) {
        return new Promise((resolve, reject) => {
            this.#db.run(
                `DELETE FROM user_to_game
                 WHERE game_id = ?
                 AND EXISTS (SELECT 1 FROM user WHERE id = ? AND is_admin = 1)`,
                [game_id, modified_by],
                (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            );
        });
    }

    async #removeGameRecord(game_id, modified_by) {
        return new Promise((resolve, reject) => {
            this.#db.run(
                `DELETE FROM game 
                 WHERE id = ? 
                 AND EXISTS (SELECT 1 FROM user WHERE id = ? AND is_admin = 1)`,
                [game_id, modified_by],
                function (err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.changes);
                    }
                }
            );
        });
    }

    async remove_game(game_id, modified_by) {
        try {
            await this.#removePlayersFromGame(game_id, modified_by);
            const changes = await this.#removeGameRecord(game_id, modified_by);

            if (changes === 0) {
                return { success: false, result: "You are not admin or game not found." };
            }
            return { success: true, result: "Game removed." };
        } catch (err) {
            console.error('Database error during game removal:', err);
            return { success: false, result: err.message };
        }
    }
};
