CREATE TABLE user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegramUsername TEXT UNIQUE,
    telegramId INTEGER UNIQUE,
    name TEXT NOT NULL UNIQUE,
    createdAt TIMESTAMP NOT NULL,
    modifiedAt TIMESTAMP NOT NULL,
    modifiedBy INTEGER NOT NULL REFERENCES user(id),
    isActive BOOL NOT NULL DEFAULT false,
    isAdmin BOOL NOT NULL DEFAULT false
);

CREATE TABLE gameRules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    numberOfPlayers INTEGER NOT NULL,
    uma TEXT NOT NULL,
    startingPoints INTEGER NOT NULL,
    startingRating INTEGER NOT NULL,
    minimumGamesForRating INTEGER NOT NULL
);

CREATE TABLE eventType (
    type TEXT NOT NULL PRIMARY KEY
);

CREATE TABLE event (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    type TEXT REFERENCES eventType(type),
    gameRules INTEGER NOT NULL REFERENCES gameRules(id),
    dateFrom TIMESTAMP,
    dateTo TIMESTAMP,
    createdAt TIMESTAMP NOT NULL,
    modifiedAt TIMESTAMP NOT NULL,
    modifiedBy INTEGER NOT NULL REFERENCES user(id)
);

CREATE TABLE game (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    eventId INTEGER NOT NULL REFERENCES event(id),
    createdAt TIMESTAMP NOT NULL,
    modifiedAt TIMESTAMP NOT NULL,
    modifiedBy INTEGER NOT NULL REFERENCES user(id),
    UNIQUE (eventId, createdAt)
);

CREATE TABLE gameStartPlace (
    startPlace TEXT NOT NULL PRIMARY KEY
);

CREATE TABLE userToGame (
    userId INTEGER NOT NULL REFERENCES user(id),
    gameId INTEGER NOT NULL REFERENCES game(id),
    startPlace TEXT REFERENCES gameStartPlace(startPlace),
    points INTEGER NOT NULL,
    createdAt TIMESTAMP NOT NULL,
    modifiedAt TIMESTAMP NOT NULL,
    modifiedBy INTEGER NOT NULL REFERENCES user(id),
    PRIMARY KEY (userId, gameId)
);

CREATE TABLE userRatingChange (
    userId INTEGER NOT NULL REFERENCES user(id),
    eventId INTEGER NOT NULL REFERENCES event(id),
    gameId INTEGER NOT NULL REFERENCES game(id),
    ratingChange INTEGER NOT NULL,
    rating INTEGER NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    PRIMARY KEY (userId, gameId)
);

-- Insert initial data
INSERT INTO gameRules(id, name, numberOfPlayers, uma, startingPoints, startingRating, minimumGamesForRating) VALUES
    (1, 'Сезон 3-5 йонма', 4, '15,5,-5,-15', 30000, 1000, 0),
    (2, 'Сезон 6 йонма', 4, '24,-2,-6,-16;16,8,-8,-16;16,6,2,-24', 30000, 0, 5),
    (3, 'Сезон 6 санма', 3, '15,0,-15', 35000, 1000, 0),
    (4, 'EMA 2025', 4, '15,5,-5,-15', 30000, 0, 0);

INSERT INTO eventType(type) VALUES ('SEASON'), ('TOURNAMENT');

INSERT INTO gameStartPlace(startPlace) VALUES ('EAST'), ('SOUTH'), ('WEST'), ('NORTH');

INSERT INTO user (id, name, telegramUsername, telegramId, modifiedBy, isAdmin, isActive, createdAt, modifiedAt)
VALUES (0, 'SYSTEM', NULL, NULL, 0, 1, 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

INSERT INTO event(id, name, description, type, gameRules, dateFrom, dateTo, createdAt, modifiedAt, modifiedBy) VALUES
    (1, 'Сезон 3', '2024 осінній сезон', 'SEASON', 1, '2024-06-30T21:00:00.000Z', '2024-12-31T22:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 0),
    (2, 'Сезон 4', '2025 весняний сезон', 'SEASON', 1, '2024-12-31T22:00:00.000Z', '2025-06-30T21:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 0),
    (3, 'Сезон 5', '2025 осінній сезон', 'SEASON', 1, '2025-07-31T21:00:00.000Z', '2025-12-31T22:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 0),
    (4, 'Сезон 6', '2026 весняний сезон', 'SEASON', 2, '2026-01-31T22:00:00.000Z', '2026-06-30T21:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 0),
    (5, 'Санма Сезон 1', 'Рейтинговий сезон з санми', 'SEASON', 3, '2026-01-31T22:00:00.000Z', '2026-06-30T21:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 0);
