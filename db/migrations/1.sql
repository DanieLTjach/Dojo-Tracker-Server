CREATE TABLE user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_username TEXT UNIQUE,
    telegram_id INTEGER UNIQUE,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_by INTEGER NOT NULL REFERENCES user(id),
    is_active BOOL NOT NULL DEFAULT true,
    is_admin BOOL NOT NULL DEFAULT false
);

CREATE TABLE club (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_by INTEGER NOT NULL REFERENCES user(id)
);

CREATE TABLE event_type (
    type TEXT NOT NULL PRIMARY KEY
);

CREATE TABLE game_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    number_of_players INTEGER NOT NULL,
    uma TEXT NOT NULL,
    starting_points INTEGER NOT NULL
);

CREATE TABLE event (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    club_id INTEGER NOT NULL REFERENCES club(id),
    type INTEGER REFERENCES event_type(type),
    game_rules INTEGER NOT NULL REFERENCES game_rules(id),
    date_from TIMESTAMP,
    date_to TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_by INTEGER NOT NULL REFERENCES user(id)
);

CREATE TABLE game (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES event(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_by INTEGER NOT NULL REFERENCES user(id)
);

CREATE TABLE game_start_place (
    start_place TEXT NOT NULL PRIMARY KEY
);

CREATE TABLE user_rating (
    user_id INTEGER NOT NULL REFERENCES user(id),
    event_id INTEGER NOT NULL REFERENCES event(id),
    rating REAL NOT NULL,
    modified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_by INTEGER NOT NULL REFERENCES user(id),
    PRIMARY KEY (user_id, event_id)
);

CREATE TABLE user_to_game (
    user_id INTEGER NOT NULL REFERENCES user(id),
    game_id INTEGER NOT NULL REFERENCES game(id),
    start_place TEXT REFERENCES game_start_place(start_place),
    points INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_by INTEGER NOT NULL REFERENCES user(id),
    PRIMARY KEY (user_id, game_id)
);

CREATE TABLE standart_hanchan_hands (
    hand_id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    hand_type INTEGER NOT NULL REFERENCES hand_type_dict(hand_type),
    repeat INTEGER DEFAULT 0,
    win_type INTEGER REFERENCES win_type_dict(win_type),
    east_points INTEGER NOT NULL,
    south_points INTEGER NOT NULL,
    west_points INTEGER NOT NULL,
    north_points INTEGER NOT NULL,
    riichi_east BOOL,
    riichi_south BOOL,
    riichi_west BOOL,
    riichi_north BOOL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_by INTEGER NOT NULL REFERENCES user(id)
);

CREATE TABLE achievements (
    achievement_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_by INTEGER NOT NULL REFERENCES user(id)
);

CREATE TABLE user_to_achievements (
    record_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES user(id),
    achievement_id INTEGER NOT NULL REFERENCES achievements(achievement_id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_by INTEGER NOT NULL REFERENCES user(id)
);

CREATE TABLE hand_type_dict (
    hand_type INTEGER PRIMARY KEY,
    hand_type_desc TEXT NOT NULL
);

CREATE TABLE win_type_dict (
    win_type INTEGER PRIMARY KEY,
    win_type_desc TEXT NOT NULL
);

-- Insert initial data
INSERT INTO game_rules(id, name, number_of_players, uma, starting_points) VALUES
    (1, 'Standard yonma', 4, '[15, 5, -5, -15]', 30000),
    (2, 'Standard sanma', 3, '[15, 0, -15]', 35000);

INSERT INTO event_type(type) VALUES ('SEASON'), ('TOURNAMENT');

INSERT INTO game_start_place(start_place) VALUES ('EAST'), ('SOUTH'), ('WEST'), ('NORTH');

INSERT INTO user (id, name, telegram_username, telegram_id, modified_by, is_admin) VALUES (0, 'SYSTEM', NULL, NULL, 0, 1);

INSERT INTO club (id, name, modified_by) VALUES (1, 'Test Club', 0);
INSERT INTO event (id, name, club_id, type, game_rules, modified_by) VALUES (1, 'Test Event', 1, 'SEASON', 1, 0);