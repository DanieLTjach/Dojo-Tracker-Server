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
