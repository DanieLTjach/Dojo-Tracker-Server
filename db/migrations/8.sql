-- Per-tournament achievements.
--
-- Achievement winners are derived entirely from finished games (userToGame,
-- gameRound, userRatingChange), so these tables are a cache/snapshot that the
-- AchievementService rewrites whenever an event's finished games change.

-- One row per (event, metric, winning user). `value` is the achievement's
-- headline value (the max/min metric value the winners share, or the qualifier
-- count for "list all qualifiers" achievements) and is repeated across the
-- winners of the same metric.
CREATE TABLE eventAchievement (
    eventId INTEGER NOT NULL REFERENCES event(id),
    metric TEXT NOT NULL,
    userId INTEGER NOT NULL REFERENCES user(id),
    value INTEGER NOT NULL,
    PRIMARY KEY (eventId, metric, userId)
);

-- Lookup by user for the profile page (achievements won across all tournaments).
CREATE INDEX idx_eventAchievement_userId ON eventAchievement(userId);

-- Marks that an event's achievements have been computed. Without this an event
-- whose computation legitimately produced no awards would be recomputed on every
-- read; the marker lets us distinguish "no awards" from "never computed".
CREATE TABLE eventAchievementComputed (
    eventId INTEGER NOT NULL PRIMARY KEY REFERENCES event(id),
    computedAt TIMESTAMP NOT NULL
);
