const sqlite3 = require('sqlite3').verbose();
const users_db = new sqlite3.Database('./storage/users.db');

users_db.serialize(function () {
    users_db.run(`
        CREATE TABLE IF NOT EXISTS players (
            user_id INTEGER PRIMARY KEY,
            user_telegram TEXT,
            user_Name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            modified_by INTEGER,
            is_activated BOOL DEFAULT false
        )
    `);

    users_db.run(`
        CREATE TABLE IF NOT EXISTS game_type_dict (
            game_type INTEGER PRIMARY KEY,
            type_desc TEXT NOT NULL UNIQUE
        )
    `);

    users_db.run(`
        CREATE TABLE IF NOT EXISTS games (
            game_id INTEGER PRIMARY KEY,
            game_type INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            modified_by INTEGER,
            FOREIGN KEY (game_type) REFERENCES game_type_dict (game_type)
        )
    `);

    users_db.run(`
        CREATE TABLE IF NOT EXISTS player_To_game (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            game_id INTEGER,
            start_place INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            modified_by INTEGER,
            FOREIGN KEY (user_id) REFERENCES players(user_id),
            FOREIGN KEY (game_id) REFERENCES games(game_id)
        )
    `);

    users_db.run(`
        CREATE TABLE IF NOT EXISTS start_place_dict (
            start_place INTEGER PRIMARY KEY,
            start_place_desc TEXT NOT NULL UNIQUE
        )
    `);

    users_db.run(`
        CREATE TABLE IF NOT EXISTS standart_hanchan_result (
            game_id INTEGER,
            east INTEGER NOT NULL,
            south INTEGER NOT NULL,
            west INTEGER NOT NULL,
            north INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            modified_by INTEGER,
            FOREIGN KEY (game_id) REFERENCES games (game_id)
        )
    `);

    users_db.run(`
        CREATE TABLE IF NOT EXISTS standart_hanchan_hands (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id INTEGER NOT NULL,
            hand_type INTEGER NOT NULL,
            repeat INTEGER DEFAULT 0,
            win_type INTEGER,
            east INTEGER NOT NULL,
            south INTEGER NOT NULL,
            west INTEGER NOT NULL,
            north INTEGER NOT NULL,
            riichi_east BOOL,
            riichi_south BOOL,
            riichi_west BOOL,
            riichi_north BOOL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            modified_by INTEGER,
            FOREIGN KEY (hand_type) REFERENCES hand_type_dist (hand_type),
            FOREIGN KEY (win_type) REFERENCES win_type_dist (win_type)
        )
    `);

    users_db.run(`
        CREATE TABLE IF NOT EXISTS hand_type_dist (
            hand_type INTEGER PRIMARY KEY,
            hand_type_desc TEXT NOT NULL UNIQUE
        )
    `);

    users_db.run(`
        CREATE TABLE IF NOT EXISTS win_type_dist (
            win_type INTEGER PRIMARY KEY,
            win_type_desc TEXT NOT NULL UNIQUE
        )
    `);
});


module.exports = users_db;