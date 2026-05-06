-- Backfill any remaining global events to Japan Dojo.
-- Migration 4 set clubId for all events that existed at that point, but events
-- created between migrations 4 and 6 with clubId=NULL would otherwise be
-- unmanageable under the new requireEventManagementRole middleware.
UPDATE event SET clubId = (SELECT id FROM club WHERE name = 'Japan Dojo') WHERE clubId IS NULL;

-- Profile native-language names (existing firstNameEn/lastNameEn are EMA-specific)
ALTER TABLE profile ADD COLUMN firstName TEXT;
ALTER TABLE profile ADD COLUMN lastName TEXT;

-- Event tournament fields (only meaningful for type='TOURNAMENT')
ALTER TABLE event ADD COLUMN maxParticipants INTEGER;
ALTER TABLE event ADD COLUMN registrationDeadline TIMESTAMP;

-- Event registration status lookup
CREATE TABLE eventRegistrationStatus (
    status TEXT NOT NULL PRIMARY KEY
);
INSERT INTO eventRegistrationStatus (status) VALUES ('PENDING'), ('APPROVED'), ('REJECTED');

CREATE TABLE eventRegistration (
    eventId INTEGER NOT NULL REFERENCES event(id),
    userId INTEGER NOT NULL REFERENCES user(id),
    status TEXT NOT NULL REFERENCES eventRegistrationStatus(status) DEFAULT 'PENDING',
    createdAt TIMESTAMP NOT NULL,
    modifiedAt TIMESTAMP NOT NULL,
    modifiedBy INTEGER NOT NULL REFERENCES user(id),
    PRIMARY KEY (eventId, userId)
);

-- Backfill APPROVED registrations for users who already played in any tournament event
INSERT INTO eventRegistration (eventId, userId, status, createdAt, modifiedAt, modifiedBy)
SELECT DISTINCT g.eventId, utg.userId, 'APPROVED', e.createdAt, e.modifiedAt, e.modifiedBy
FROM userToGame utg
JOIN game g ON g.id = utg.gameId
JOIN event e ON e.id = g.eventId
WHERE e.type = 'TOURNAMENT';
