CREATE TABLE wind (
    wind TEXT NOT NULL PRIMARY KEY
);

INSERT INTO wind (wind) VALUES ('EAST'), ('SOUTH'), ('WEST'), ('NORTH');

CREATE TABLE userToGame_new (
    userId INTEGER NOT NULL REFERENCES user(id),
    gameId INTEGER NOT NULL REFERENCES game(id),
    startPlace TEXT REFERENCES wind(wind),
    points INTEGER NOT NULL,
    chomboCount INTEGER NOT NULL,
    createdAt TIMESTAMP NOT NULL,
    modifiedAt TIMESTAMP NOT NULL,
    modifiedBy INTEGER NOT NULL REFERENCES user(id),
    PRIMARY KEY (userId, gameId)
);

INSERT INTO userToGame_new (userId, gameId, startPlace, points, chomboCount, createdAt, modifiedAt, modifiedBy)
SELECT userId, gameId, startPlace, points, chomboCount, createdAt, modifiedAt, modifiedBy
FROM userToGame;

DROP TABLE userToGame;
ALTER TABLE userToGame_new RENAME TO userToGame;

DROP TABLE gameStartPlace;

CREATE TABLE gameStatus (
    status TEXT NOT NULL PRIMARY KEY
);

INSERT INTO gameStatus (status) VALUES ('CREATED'), ('IN_PROGRESS'), ('FINISHED');

CREATE TABLE game_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    eventId INTEGER NOT NULL REFERENCES event(id),
    createdAt TIMESTAMP NOT NULL,
    modifiedAt TIMESTAMP NOT NULL,
    modifiedBy INTEGER NOT NULL REFERENCES user(id),
    tournamentRound INTEGER,
    tournamentTable TEXT,
    status TEXT NOT NULL REFERENCES gameStatus(status),
    startedAt TIMESTAMP,
    endedAt TIMESTAMP,
    lastRoundWasDeleted BOOL NOT NULL DEFAULT false,
    UNIQUE (eventId, createdAt)
);

INSERT INTO game_new (
    id,
    eventId,
    createdAt,
    modifiedAt,
    modifiedBy,
    tournamentRound,
    tournamentTable,
    status,
    startedAt,
    endedAt,
    lastRoundWasDeleted
)
SELECT
    id,
    eventId,
    createdAt,
    modifiedAt,
    modifiedBy,
    tournamentHanchanNumber,
    CASE WHEN tournamentTableNumber IS NULL THEN NULL ELSE CAST(tournamentTableNumber AS TEXT) END,
    'FINISHED',
    createdAt,
    createdAt,
    false
FROM game;

DROP TABLE game;
ALTER TABLE game_new RENAME TO game;

CREATE TABLE gameRound (
    gameId INTEGER NOT NULL REFERENCES game(id),
    roundNumber INTEGER NOT NULL,
    wind TEXT NOT NULL REFERENCES wind(wind),
    dealerNumber INTEGER NOT NULL,
    counters INTEGER NOT NULL,
    riichiSticks INTEGER NOT NULL,
    result TEXT NOT NULL,
    PRIMARY KEY (gameId, roundNumber)
);

ALTER TABLE event ADD COLUMN info TEXT;

-- set EMA starting points to 30000
UPDATE gameRules SET startingPoints = 30000 WHERE id = 4 OR id = 11;

ALTER TABLE eventRegistration ADD COLUMN isFillerPlayer BOOL NOT NULL DEFAULT false;