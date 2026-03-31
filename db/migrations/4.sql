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
