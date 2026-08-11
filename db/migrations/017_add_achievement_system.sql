-- Club-scoped manual achievements and lifetime automatic achievements system.

CREATE TABLE clubAchievementDefinition (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clubId INTEGER NOT NULL REFERENCES club(id),
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    icon TEXT,
    archivedAt TIMESTAMP,
    archivedBy INTEGER REFERENCES user(id),
    createdAt TIMESTAMP NOT NULL,
    createdBy INTEGER NOT NULL REFERENCES user(id),
    modifiedAt TIMESTAMP NOT NULL,
    modifiedBy INTEGER NOT NULL REFERENCES user(id)
);

CREATE INDEX idx_clubAchievementDefinition_clubId ON clubAchievementDefinition(clubId);

-- Custom names are unique case-insensitively among a club's active definitions.
CREATE UNIQUE INDEX idx_clubAchievementDefinition_activeName
    ON clubAchievementDefinition(clubId, lower(name))
    WHERE archivedAt IS NULL;

-- One row per awarded manual achievement (builtInCode or custom definitionId).
CREATE TABLE clubUserAchievement (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clubId INTEGER NOT NULL REFERENCES club(id),
    userId INTEGER NOT NULL REFERENCES user(id),
    builtInCode TEXT,
    definitionId INTEGER REFERENCES clubAchievementDefinition(id),
    note TEXT,
    awardedAt TIMESTAMP NOT NULL,
    awardedBy INTEGER NOT NULL REFERENCES user(id),
    revokedAt TIMESTAMP,
    revokedBy INTEGER REFERENCES user(id),
    CHECK ((builtInCode IS NULL) != (definitionId IS NULL))
);

CREATE INDEX idx_clubUserAchievement_userId ON clubUserAchievement(userId);
CREATE INDEX idx_clubUserAchievement_clubId ON clubUserAchievement(clubId);

CREATE UNIQUE INDEX idx_clubUserAchievement_activeBuiltIn
    ON clubUserAchievement(clubId, userId, builtInCode)
    WHERE revokedAt IS NULL AND builtInCode IS NOT NULL;

CREATE UNIQUE INDEX idx_clubUserAchievement_activeCustom
    ON clubUserAchievement(clubId, userId, definitionId)
    WHERE revokedAt IS NULL AND definitionId IS NOT NULL;

-- State for lifetime automatic achievements, keyed by user, stable code, and scope.
CREATE TABLE automaticAchievementState (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL REFERENCES user(id),
    code TEXT NOT NULL,
    scope TEXT NOT NULL DEFAULT 'GLOBAL',
    progress INTEGER NOT NULL DEFAULT 0,
    target INTEGER NOT NULL,
    unlockedAt TIMESTAMP,
    sourceEventId INTEGER REFERENCES event(id),
    sourceGameId INTEGER REFERENCES game(id),
    sourceRoundNumber INTEGER,
    value REAL,
    computedAt TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX idx_automaticAchievementState_userCodeScope
    ON automaticAchievementState(userId, code, scope);

CREATE INDEX idx_automaticAchievementState_userId
    ON automaticAchievementState(userId);

-- Dice values recorded for starting East player in tracked games.
ALTER TABLE game ADD COLUMN startingDie1 INTEGER CHECK (startingDie1 IS NULL OR (startingDie1 >= 1 AND startingDie1 <= 6));
ALTER TABLE game ADD COLUMN startingDie2 INTEGER CHECK (startingDie2 IS NULL OR (startingDie2 >= 1 AND startingDie2 <= 6));
