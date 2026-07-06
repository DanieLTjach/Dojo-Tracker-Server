-- Tournament seating is persisted as regular games. Remove the obsolete static
-- seating payload from event info, collapsing pairing-only objects to NULL.
UPDATE event
SET info = NULLIF(json_remove(info, '$.pairings'), '{}')
WHERE info IS NOT NULL
  AND json_type(info, '$.pairings') IS NOT NULL;


-- Team mode (v1: tournaments only).
--
-- Adds: an event "format" dimension (parallel to event.type), the team /
-- teamMembership entities (per-event), a DRAFT tournament status for the
-- "registration closed, forming teams" phase, and team attribution columns on
-- userRatingChange so a game's contribution to a team rating is frozen at finish
-- time (future-proofing season team modes where only some games count).

-- Event format. INDIVIDUAL keeps existing behaviour; TEAM is the new team
-- tournament path. HYBRID is reserved for future team seasons and is rejected at
-- the service layer for now.
CREATE TABLE eventFormat (
    format TEXT NOT NULL PRIMARY KEY
);
INSERT INTO eventFormat (format) VALUES ('INDIVIDUAL'), ('TEAM'), ('HYBRID');

ALTER TABLE event ADD COLUMN format TEXT NOT NULL DEFAULT 'INDIVIDUAL'
    REFERENCES eventFormat(format);

-- New tournament status for the draft phase: registration is closed and teams
-- are being formed, before the first round starts. Additive — the existing
-- CREATED (registration open) -> IN_PROGRESS -> LAST_ROUND -> FINISHED flow is
-- unchanged; TEAM tournaments insert DRAFT between CREATED and IN_PROGRESS.
INSERT INTO tournamentStatus (status) VALUES ('DRAFT');

-- Team roles within a team.
CREATE TABLE teamRole (
    role TEXT NOT NULL PRIMARY KEY
);
INSERT INTO teamRole (role) VALUES ('CAPTAIN'), ('MEMBER');

-- A team is bound to an EVENT (not a club): team composition is independent per
-- event, so a player can be in different teams across events.
CREATE TABLE team (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    eventId INTEGER NOT NULL REFERENCES event(id),
    name TEXT NOT NULL,
    createdAt TIMESTAMP NOT NULL,
    modifiedAt TIMESTAMP NOT NULL,
    modifiedBy INTEGER NOT NULL REFERENCES user(id),
    UNIQUE (eventId, name)
);
CREATE INDEX idx_team_eventId ON team(eventId);

-- Membership. eventId is denormalised onto the row so the "one team per player
-- per event" rule is a single UNIQUE constraint and the per-event player->team
-- lookup (hot path for seating + every game finish) is index-only. A row's
-- teamId already pins the event, and the app writes both in one transaction, so
-- the columns cannot drift.
CREATE TABLE teamMembership (
    teamId INTEGER NOT NULL REFERENCES team(id),
    eventId INTEGER NOT NULL REFERENCES event(id),
    userId INTEGER NOT NULL REFERENCES user(id),
    role TEXT NOT NULL REFERENCES teamRole(role),
    createdAt TIMESTAMP NOT NULL,
    modifiedAt TIMESTAMP NOT NULL,
    modifiedBy INTEGER NOT NULL REFERENCES user(id),
    PRIMARY KEY (teamId, userId),
    UNIQUE (eventId, userId)
);
CREATE INDEX idx_teamMembership_eventId ON teamMembership(eventId);
CREATE INDEX idx_teamMembership_userId ON teamMembership(userId);

-- Team rating snapshot on each rating change, frozen at game-finish time.
-- teamId     = the player's team at the moment the game was scored (NULL if none).
-- teamRating = the team's current rating after this game, mirroring userRatingChange.rating
--              for individual ratings. It lets team standings read the latest row for a
--              team instead of summing historical deltas.
ALTER TABLE userRatingChange ADD COLUMN teamId INTEGER REFERENCES team(id);
ALTER TABLE userRatingChange ADD COLUMN teamRating INTEGER;
CREATE INDEX idx_userRatingChange_teamId ON userRatingChange(teamId);
