const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./service/db/storage/data.db');

db.serialize(function () {
    db.run(`
        CREATE TABLE IF NOT EXISTS player (
            user_id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_telegram_nickname TEXT,
            user_telegram_id INTEGER,
            user_name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            modified_by INTEGER,
            is_active BOOL DEFAULT true,
            is_admin BOOL DEFAULT false,
            FOREIGN KEY (modified_by) REFERENCES player(user_id)
        );
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS game_type_dict (
            game_type INTEGER PRIMARY KEY,
            type_desc TEXT NOT NULL
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS game (
            game_id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_type INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            modified_by INTEGER,
            FOREIGN KEY (game_type) REFERENCES game_type_dict(game_type),
            FOREIGN KEY (modified_by) REFERENCES player(user_id)
        );
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS player_to_game (
            record_id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            game_id INTEGER,
            start_place INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            modified_by INTEGER,
            FOREIGN KEY (start_place) REFERENCES start_place_dict(start_place),
            FOREIGN KEY (user_id) REFERENCES player(user_id),
            FOREIGN KEY (game_id) REFERENCES game(game_id),
            FOREIGN KEY (modified_by) REFERENCES player(user_id)
        );
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS start_place_dict (
            start_place INTEGER PRIMARY KEY,
            start_place_desc TEXT NOT NULL
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS standart_hanchan_result (
            game_id INTEGER,
            east_points INTEGER NOT NULL,
            south_points INTEGER NOT NULL,
            west_points INTEGER NOT NULL,
            north_points INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            modified_by INTEGER,
            FOREIGN KEY (game_id) REFERENCES game(game_id),
            FOREIGN KEY (modified_by) REFERENCES player(user_id)
        );
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS standart_hanchan_hands (
            hand_id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id INTEGER NOT NULL,
            hand_type INTEGER NOT NULL,
            repeat INTEGER DEFAULT 0,
            win_type INTEGER,
            east_points INTEGER NOT NULL,
            south_points INTEGER NOT NULL,
            west_points INTEGER NOT NULL,
            north_points INTEGER NOT NULL,
            riichi_east BOOL,
            riichi_south BOOL,
            riichi_west BOOL,
            riichi_north BOOL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            modified_by INTEGER,
            FOREIGN KEY (hand_type) REFERENCES hand_type_dict(hand_type),
            FOREIGN KEY (win_type) REFERENCES win_type_dict(win_type),
            FOREIGN KEY (modified_by) REFERENCES player(user_id)
        );
    `);

    db.run(`
        CREATE TABLE if not exists achievements (
            achievement_id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            modified_by INTEGER,
            FOREIGN KEY (modified_by) REFERENCES player(user_id)
        );
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS player_to_achievements (
            record_id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            achievement_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            modified_by INTEGER,
            FOREIGN KEY (user_id) REFERENCES player(user_id),
            FOREIGN KEY (achievement_id) REFERENCES achievements(achievement_id),
            FOREIGN KEY (modified_by) REFERENCES player(user_id)
        );
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS hand_type_dict (
            hand_type INTEGER PRIMARY KEY,
            hand_type_desc TEXT NOT NULL
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS win_type_dict (
            win_type INTEGER PRIMARY KEY,
            win_type_desc TEXT NOT NULL
        )
    `);

    db.run(`
        create table if not exists clubs (
            club_id INTEGER PRIMARY KEY AUTOINCREMENT,
            club_name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            modified_by INTEGER,
            FOREIGN KEY (modified_by) REFERENCES player(user_id)
        )
        `);
    
    db.run(`create table if not exists club_to_game (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            club_id INTEGER NOT NULL,
            game_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            modified_by INTEGER,
            FOREIGN KEY (club_id) REFERENCES cites(club_id),
            FOREIGN KEY (game_id) REFERENCES game(game_id),
            FOREIGN KEY (modified_by) REFERENCES player(user_id)
        )`)
    db.run(`create table if not exists event_type_dict (
            event_type integer primary key,
            event_type_desc text not null
        )`);

    db.run(`create table if not exists event (
            id integer primary key autoincrement,
            name text,
            type integer,
            date_from timestamp,
            date_to timestamp,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            modified_by INTEGER,
            foreign key (type) references ivent_type_dict(ivent_type)
        )`)

    db.run(`create table if not exists game_to_ivent (
            id integer primary key autoincrement,
            game_id integer not null,
            ivent_id integer not null,
            foreign key(game_id) references game(game_id),
            foreign key(ivent_id) references ivent(id)
            )`)

    db.run(`
        INSERT OR IGNORE INTO game_type_dict(game_type, type_desc) VALUES (0, "Yonma")
        `);

    db.run(`
        INSERT OR IGNORE INTO start_place_dict(start_place, start_place_desc) VALUES (0, "East"), (1, "South"), (2, "West"), (3, "North")
        `);

    db.run(`
        INSERT OR IGNORE INTO player (user_id, user_name, user_telegram_nickname, user_telegram_id, modified_by, is_admin) VALUES (0, "SYSTEM", NULL, NULL, 0, 1)
        `);

    db.run(`
        insert or ignore into event_type_dict(event_type, event_type_desc) values (0, "Yonma Ranked"), (1, "Tournament"), (2, "Friendly Match"), (4, "Other")
        `);
});


module.exports = db;