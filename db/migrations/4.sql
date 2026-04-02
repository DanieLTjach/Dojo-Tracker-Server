CREATE TABLE clubRole (
    role TEXT NOT NULL PRIMARY KEY
);
INSERT INTO clubRole (role) VALUES ('OWNER'), ('MODERATOR'), ('MEMBER');

CREATE TABLE clubMembershipStatus (
    status TEXT NOT NULL PRIMARY KEY
);
INSERT INTO clubMembershipStatus (status) VALUES ('PENDING'), ('ACTIVE'), ('INACTIVE');

CREATE TABLE club (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    address TEXT,
    city TEXT,
    description TEXT,
    contactInfo TEXT,
    isActive BOOL NOT NULL DEFAULT true,
    createdAt TIMESTAMP NOT NULL,
    modifiedAt TIMESTAMP NOT NULL,
    modifiedBy INTEGER NOT NULL REFERENCES user(id)
);

CREATE TABLE clubTelegramTopics (
    clubId INTEGER PRIMARY KEY REFERENCES club(id),
    rating TEXT,
    userLogs TEXT,
    gameLogs TEXT,
    createdAt TIMESTAMP NOT NULL,
    modifiedAt TIMESTAMP NOT NULL,
    modifiedBy INTEGER NOT NULL REFERENCES user(id)
);

CREATE TABLE clubMembership (
    clubId INTEGER NOT NULL REFERENCES club(id),
    userId INTEGER NOT NULL REFERENCES user(id),
    role TEXT NOT NULL REFERENCES clubRole(role) DEFAULT 'MEMBER',
    status TEXT NOT NULL REFERENCES clubMembershipStatus(status) DEFAULT 'PENDING',
    createdAt TIMESTAMP NOT NULL,
    modifiedAt TIMESTAMP NOT NULL,
    modifiedBy INTEGER NOT NULL REFERENCES user(id),
    PRIMARY KEY (clubId, userId)
);

INSERT INTO club (id, name, address, city, description, contactInfo, isActive, createdAt, modifiedAt, modifiedBy)
VALUES (1, 'Japan Dojo', NULL, NULL, NULL, NULL, 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 0);

INSERT INTO clubMembership (clubId, userId, role, status, createdAt, modifiedAt, modifiedBy)
SELECT
    1,
    id,
    CASE WHEN isAdmin = 1 THEN 'MODERATOR' ELSE 'MEMBER' END,
    status,
    createdAt,
    modifiedAt,
    modifiedBy
FROM user
WHERE id != 0;

ALTER TABLE event ADD COLUMN clubId INTEGER REFERENCES club(id);
UPDATE event SET clubId = 1;
ALTER TABLE club ADD COLUMN currentRatingEventId INTEGER REFERENCES event(id);

ALTER TABLE gameRules ADD COLUMN clubId INTEGER REFERENCES club(id);
UPDATE gameRules SET clubId = 1;

ALTER TABLE gameRules ADD COLUMN umaTieBreak TEXT NOT NULL DEFAULT 'DIVIDE';

-- Add global Mahjong Soul rules (clubId NULL = not tied to any club)
INSERT INTO gameRules (name, numberOfPlayers, uma, startingPoints, startingRating, minimumGamesForRating, chomboPointsAfterUma, clubId, umaTieBreak) VALUES
    ('Mahjong Soul', 4, '15,5,-5,-15', 30000, 0, 0, NULL, NULL, 'DIVIDE'),
    ('Mahjong Soul Sanma', 3, '15,0,-15', 35000, 0, 0, NULL, NULL, 'DIVIDE');

-- Fix EMA 2025: startingPoints should be 0, chomboPointsAfterUma 20000, and it is a global rule (no club)
UPDATE gameRules SET startingPoints = 0, chomboPointsAfterUma = 20000, clubId = NULL WHERE id = 4;

-- Move minimumGamesForRating and startingRating from gameRules to event (per-event config)
ALTER TABLE event ADD COLUMN minimumGamesForRating INTEGER NOT NULL DEFAULT 0;
ALTER TABLE event ADD COLUMN startingRating INTEGER NOT NULL DEFAULT 0;
UPDATE event SET
    minimumGamesForRating = (SELECT gr.minimumGamesForRating FROM gameRules gr WHERE gr.id = event.gameRules),
    startingRating = (SELECT gr.startingRating FROM gameRules gr WHERE gr.id = event.gameRules);
ALTER TABLE gameRules DROP COLUMN minimumGamesForRating;
ALTER TABLE gameRules DROP COLUMN startingRating;
