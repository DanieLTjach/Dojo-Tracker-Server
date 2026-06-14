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
