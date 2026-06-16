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

CREATE TABLE tournamentStatus (
    status TEXT NOT NULL PRIMARY KEY
);

INSERT INTO tournamentStatus (status) VALUES
    ('CREATED'), ('IN_PROGRESS'), ('LAST_ROUND'), ('FINISHED');

CREATE TABLE tournament (
    eventId INTEGER NOT NULL PRIMARY KEY REFERENCES event(id),
    status TEXT NOT NULL REFERENCES tournamentStatus(status),
    currentRound INTEGER,
    totalRounds INTEGER NOT NULL,
    createdAt TIMESTAMP NOT NULL,
    modifiedAt TIMESTAMP NOT NULL,
    modifiedBy INTEGER NOT NULL REFERENCES user(id)
);

INSERT INTO tournament (eventId, status, currentRound, totalRounds, createdAt, modifiedAt, modifiedBy)
SELECT
    e.id,
    'FINISHED',
    MAX(g.tournamentRound),
    COALESCE(MAX(g.tournamentRound), 0),
    e.createdAt,
    e.modifiedAt,
    e.modifiedBy
FROM event e
LEFT JOIN game g ON g.eventId = e.id AND g.tournamentRound IS NOT NULL
WHERE e.type = 'TOURNAMENT'
GROUP BY e.id;

-- Generic per-event configuration (JSON). Holds event-type-specific tweaks such as
-- playerNameDisplay and minParticipants so small settings don't need new columns.
ALTER TABLE event ADD COLUMN config TEXT;