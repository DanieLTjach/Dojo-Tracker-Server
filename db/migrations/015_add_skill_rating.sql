CREATE TABLE skillRating (
    clubId INTEGER NOT NULL REFERENCES club(id),
    userId INTEGER NOT NULL REFERENCES user(id),
    gameSize INTEGER NOT NULL CHECK (gameSize IN (3, 4)),
    mu REAL NOT NULL,
    sigma REAL NOT NULL,
    gamesPlayed INTEGER NOT NULL,
    firstRatedGameAt TIMESTAMP NOT NULL,
    lastRatedGameAt TIMESTAMP NOT NULL,
    modifiedAt TIMESTAMP NOT NULL,
    PRIMARY KEY (clubId, userId, gameSize)
);

CREATE INDEX idx_skillRating_clubId_gameSize ON skillRating(clubId, gameSize);
CREATE INDEX idx_skillRating_userId ON skillRating(userId);

CREATE TABLE skillRatingGame (
    gameId INTEGER NOT NULL REFERENCES game(id),
    userId INTEGER NOT NULL REFERENCES user(id),
    clubId INTEGER NOT NULL REFERENCES club(id),
    gameSize INTEGER NOT NULL CHECK (gameSize IN (3, 4)),
    rank INTEGER NOT NULL,
    muBefore REAL NOT NULL,
    sigmaBefore REAL NOT NULL,
    muAfter REAL NOT NULL,
    sigmaAfter REAL NOT NULL,
    playedAt TIMESTAMP NOT NULL,
    PRIMARY KEY (gameId, userId)
);

CREATE INDEX idx_skillRatingGame_club_size_played ON skillRatingGame(clubId, gameSize, playedAt);

CREATE TABLE clubSkillConfig (
    clubId INTEGER PRIMARY KEY REFERENCES club(id),
    provisionalGameThreshold INTEGER NOT NULL DEFAULT 30,
    isEnabled BOOL NOT NULL DEFAULT true,
    createdAt TIMESTAMP NOT NULL,
    modifiedAt TIMESTAMP NOT NULL,
    modifiedBy INTEGER NOT NULL REFERENCES user(id)
);

CREATE TABLE skillTrackDirty (
    clubId INTEGER NOT NULL REFERENCES club(id),
    gameSize INTEGER NOT NULL CHECK (gameSize IN (3, 4)),
    markedAt TIMESTAMP NOT NULL,
    reason TEXT NOT NULL,
    PRIMARY KEY (clubId, gameSize)
);
