-- Club-scoped, reusable achievement definitions. Built-in achievements (career,
-- hand, tournament, event-placement) are hardcoded in the application catalog and
-- never get a row here; this table only holds club-defined manual awards
-- (e.g. "Community Builder") plus each club's custom ones.
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

-- Custom names are unique case-insensitively among a club's active (non-archived)
-- definitions. Archiving frees the name for reuse while keeping historical
-- assignments intact.
CREATE UNIQUE INDEX idx_clubAchievementDefinition_activeName
    ON clubAchievementDefinition(clubId, name COLLATE NOCASE)
    WHERE archivedAt IS NULL;

-- One row per awarded achievement. The definition is either a built-in catalog
-- code (builtInCode) or a club's own custom definition (definitionId) — exactly
-- one of the two is set, enforced below.
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

-- At most one active (non-revoked) assignment per club/user/definition, for each
-- definition source independently (SQLite treats NULLs as distinct, so the two
-- partial indexes below don't collide with each other).
CREATE UNIQUE INDEX idx_clubUserAchievement_activeBuiltIn
    ON clubUserAchievement(clubId, userId, builtInCode)
    WHERE revokedAt IS NULL AND builtInCode IS NOT NULL;

CREATE UNIQUE INDEX idx_clubUserAchievement_activeCustom
    ON clubUserAchievement(clubId, userId, definitionId)
    WHERE revokedAt IS NULL AND definitionId IS NOT NULL;
