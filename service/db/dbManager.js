const sqlite3 = require('sqlite3').verbose();

module.exports = class DatabaseManager {
    #db;
    constructor() {
        this.#db = require("./db_init");
    }

    async list_games(game_type, date_from, date_to, user_id = null) {
        return new Promise((resolve, reject) => {
            this.#db.all(`SELECT
                g.game_id,
                g.created_at
                FROM game g
                WHERE g.created_at BETWEEN ? AND ?
                AND g.game_type = ?
                AND (
                    ? IS NULL OR EXISTS (
                    SELECT 1
                    FROM player_to_game ptg
                    WHERE ptg.game_id = g.game_id
                        AND ptg.user_id = ?
                    )
                );`, [date_from, date_to, game_type, user_id, user_id], (err, rows) => {
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
                    p.user_name,
                    CASE ptg.start_place
                        WHEN 0 THEN shr.east_points
                        WHEN 1 THEN shr.south_points
                        WHEN 2 THEN shr.west_points
                        WHEN 3 THEN shr.north_points
                    END AS points,
                    g.created_at
                FROM player_to_game ptg
                JOIN player p ON ptg.user_id = p.user_id
                JOIN game g ON ptg.game_id = g.game_id
                JOIN standart_hanchan_result shr ON g.game_id = shr.game_id
                WHERE g.game_id = ?;`,
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

    async #insertGame(game_type, modified_by, created_at = null) {
        return new Promise((resolve, reject) => {
            this.#db.run(
                `INSERT INTO game (game_type, modified_by, created_at) VALUES (?, ?, ?)`,
                [game_type, modified_by, created_at || new Date().toISOString().replace('T', ' ').split('.')[0]],
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.lastID);
                    }
                }
            );
        });
    }

    async #insertPlayer(player, gameId, modified_by, created_at = null) {
        return new Promise((resolve, reject) => {
            this.#db.run(
                `INSERT INTO player_to_game (user_id, game_id, start_place, modified_by, created_at) VALUES (?, ?, ?, ?, ?)`,
                [player.user_id, gameId, player.start_place, modified_by, created_at || new Date().toISOString().replace('T', ' ').split('.')[0]],
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

    async #insertHanchan(gameId, players_data, modified_by, created_at = null) {
        return new Promise((resolve, reject) => {
            this.#db.run(
                `INSERT INTO standart_hanchan_result (game_id, east_points, south_points, west_points, north_points, modified_by, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, datetime(?))`,
                [
                    gameId,
                    players_data[0]?.points ?? null,
                    players_data[1]?.points ?? null,
                    players_data[2]?.points ?? null,
                    players_data[3]?.points ?? null,
                    modified_by,
                    created_at || new Date().toISOString().replace('T', ' ').split('.')[0]
                ],
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

    async add_game(game_type, players_data, modified_by, created_at = null) {
        try {
            const gameId = await this.#insertGame(game_type, modified_by, created_at);
            const playerPromises = players_data.map(player => 
                this.#insertPlayer(player, gameId, modified_by, created_at)
            );
            const hanchanPromise = this.#insertHanchan(gameId, players_data, modified_by, created_at);
            
            await Promise.all([...playerPromises, hanchanPromise]);
            return { success: true, result: "Game, players, and hanchan result added successfully" };
        } catch (err) {
            console.error('Database error during game addition:', err);
            return { success: false, result: err.message };
        }
    }


    async add_achievement(name, description, modified_by) {
        return new Promise((resolve, reject) => {
            this.#db.run(
                `INSERT INTO achievements (name, description, modified_by) 
                 VALUES (?, ?, ?)`,
                [name, description, modified_by],
                function(err) {
                    if (err) {
                        console.error('Database error:', err);
                        reject({ success: false, result: err.message });
                    } else {
                        resolve({ success: true, result: "Achievement added successfully", id: this.lastID });
                    }
                }
            );
        })}

    async grant_achievement(user_id, achievement_id, modified_by) {
        return new Promise((resolve, reject) => {
            this.#db.run(
                `INSERT INTO player_to_achievements (user_id, achievement_id, modified_by) 
                 VALUES (?, ?, ?)`,
                [user_id, achievement_id, modified_by],
                function(err) {
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
                `SELECT a.* FROM player_to_achievements pta
                 JOIN achievements a ON pta.achievement_id = a.achievement_id
                 WHERE pta.user_id = ?`,
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

    async #removePlayersFromGame(game_id, modified_by) {
        return new Promise((resolve, reject) => {
            this.#db.run(
                `DELETE FROM player_to_game 
                 WHERE game_id = ? 
                 AND EXISTS (SELECT 1 FROM player WHERE user_id = ? AND is_admin = 1)`,
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

    async #removeHanchanResult(game_id, modified_by) {
        return new Promise((resolve, reject) => {
            this.#db.run(
                `DELETE FROM standart_hanchan_result 
                 WHERE game_id = ? 
                 AND EXISTS (SELECT 1 FROM player WHERE user_id = ? AND is_admin = 1)`,
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
                 WHERE game_id = ? 
                 AND EXISTS (SELECT 1 FROM player WHERE user_id = ? AND is_admin = 1)`,
                [game_id, modified_by],
                function(err) {
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
            await this.#removeHanchanResult(game_id, modified_by);
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
