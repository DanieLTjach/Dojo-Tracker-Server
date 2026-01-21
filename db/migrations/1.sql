CREATE TABLE user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegramUsername TEXT UNIQUE,
    telegramId INTEGER UNIQUE,
    name TEXT NOT NULL UNIQUE,
    createdAt TIMESTAMP NOT NULL,
    modifiedAt TIMESTAMP NOT NULL,
    modifiedBy INTEGER NOT NULL REFERENCES user(id),
    isActive BOOL NOT NULL DEFAULT true,
    isAdmin BOOL NOT NULL DEFAULT false
);

CREATE TABLE eventType (
    type TEXT NOT NULL PRIMARY KEY
);

CREATE TABLE gameRules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    numberOfPlayers INTEGER NOT NULL,
    uma TEXT NOT NULL,
    startingPoints INTEGER NOT NULL,
    startingRating REAL NOT NULL
);

CREATE TABLE event (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    description TEXT,
    type INTEGER REFERENCES eventType(type),
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
    modifiedBy INTEGER NOT NULL REFERENCES user(id)
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

CREATE TABLE standartHanchanHands (
    handId INTEGER PRIMARY KEY AUTOINCREMENT,
    gameId INTEGER NOT NULL,
    handType INTEGER NOT NULL REFERENCES handTypeDict(handType),
    repeat INTEGER DEFAULT 0,
    winType INTEGER REFERENCES winTypeDict(winType),
    eastPoints INTEGER NOT NULL,
    southPoints INTEGER NOT NULL,
    westPoints INTEGER NOT NULL,
    northPoints INTEGER NOT NULL,
    riichiEast BOOL,
    riichiSouth BOOL,
    riichiWest BOOL,
    riichiNorth BOOL,
    createdAt TIMESTAMP NOT NULL,
    modifiedAt TIMESTAMP NOT NULL,
    modifiedBy INTEGER NOT NULL REFERENCES user(id)
);

CREATE TABLE achievements (
    achievementId INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    createdAt TIMESTAMP NOT NULL,
    modifiedAt TIMESTAMP NOT NULL,
    modifiedBy INTEGER NOT NULL REFERENCES user(id)
);

CREATE TABLE userToAchievements (
    recordId INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL REFERENCES user(id),
    achievementId INTEGER NOT NULL REFERENCES achievements(achievementId),
    createdAt TIMESTAMP NOT NULL,
    modifiedAt TIMESTAMP NOT NULL,
    modifiedBy INTEGER NOT NULL REFERENCES user(id)
);

CREATE TABLE handTypeDict (
    handType INTEGER PRIMARY KEY,
    handTypeDesc TEXT NOT NULL
);

CREATE TABLE winTypeDict (
    winType INTEGER PRIMARY KEY,
    winTypeDesc TEXT NOT NULL
);

-- Insert initial data
INSERT INTO gameRules(id, name, numberOfPlayers, uma, startingPoints, startingRating) VALUES
    (1, 'Standard yonma', 4, '24,-2,-6,-16;16,8,-8,-16;16,6,2,-24', 30000, 1000),
    (2, 'Standard sanma', 3, '15,0,-15', 35000, 1000);

INSERT INTO eventType(type) VALUES ('SEASON'), ('TOURNAMENT');

INSERT INTO gameStartPlace(startPlace) VALUES ('EAST'), ('SOUTH'), ('WEST'), ('NORTH');

INSERT INTO user (id, name, telegramUsername, telegramId, modifiedBy, isAdmin, createdAt, modifiedAt) 
VALUES (0, 'SYSTEM', NULL, NULL, 0, 1, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');

INSERT INTO event (id, name, type, gameRules, modifiedBy, createdAt, modifiedAt) 
VALUES (1, 'Test Event', 'SEASON', 1, 0, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');