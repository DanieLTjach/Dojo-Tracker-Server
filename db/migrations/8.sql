CREATE TABLE clubInviteType (
    type TEXT NOT NULL PRIMARY KEY
);
INSERT INTO clubInviteType (type) VALUES ('JOIN_CLUB'), ('REGISTRATION_ONLY');

CREATE TABLE clubInviteSource (
    source TEXT NOT NULL PRIMARY KEY
);
INSERT INTO clubInviteSource (source) VALUES ('PERSON'), ('TUTORIAL'), ('FESTIVAL'), ('SOCIAL_NETWORK'), ('OTHER');

CREATE TABLE clubInvite (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clubId INTEGER NOT NULL REFERENCES club(id),
    code TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL REFERENCES clubInviteType(type),
    source TEXT NOT NULL REFERENCES clubInviteSource(source),
    label TEXT,
    maxUses INTEGER,
    usesCount INTEGER NOT NULL DEFAULT 0,
    expiresAt TIMESTAMP,
    isActive BOOL NOT NULL DEFAULT true,
    createdAt TIMESTAMP NOT NULL,
    modifiedAt TIMESTAMP NOT NULL,
    modifiedBy INTEGER NOT NULL REFERENCES user(id)
);

CREATE TABLE clubInviteRedemption (
    inviteId INTEGER NOT NULL REFERENCES clubInvite(id),
    userId INTEGER NOT NULL REFERENCES user(id),
    redeemedAt TIMESTAMP NOT NULL,
    PRIMARY KEY (inviteId, userId)
);

CREATE INDEX idx_clubInvite_clubId ON clubInvite(clubId);
CREATE INDEX idx_clubInviteRedemption_userId ON clubInviteRedemption(userId);

ALTER TABLE gameRules DROP COLUMN chomboPointsAfterUma;

-- Remove the deprecated nagashi_mangan_count_as_a_win rule from the EMA 2025 ruleset.
UPDATE gameRules SET details = '{"preset":"ema_2025","rules":{"call_precedence":"ron_pon","chombo":"mangan","counted_yakuman":true,"double_yakuman":true,"nagashi_mangan":true,"red_fives":"three_one_per_suit","starting_points":30000,"yakuman_stacking":true}}' WHERE id = 2;


-- One row per (event, metric, winning user). `value` is the achievement's
-- headline value (the max/min metric value the winners share) and is repeated
-- across the winners of the same metric. NULL for "list all qualifiers"
-- achievements, where a single value makes no sense.
CREATE TABLE eventAchievement (
    eventId INTEGER NOT NULL REFERENCES event(id),
    metric TEXT NOT NULL,
    userId INTEGER NOT NULL REFERENCES user(id),
    value INTEGER,
    PRIMARY KEY (eventId, metric, userId)
);

-- Lookup by user for the profile page (achievements won across all tournaments).
CREATE INDEX idx_eventAchievement_userId ON eventAchievement(userId);

-- Marks when an event's achievements were last computed. Without this an event
-- whose computation legitimately produced no awards would be recomputed on every
-- read; the marker lets us distinguish "no awards" from "never computed".
ALTER TABLE event ADD COLUMN achievementsComputedAt TIMESTAMP;