CREATE TABLE clubInviteType (
    type TEXT NOT NULL PRIMARY KEY
);
INSERT INTO clubInviteType (type) VALUES ('AUTO_APPROVE'), ('SYSTEM_ONLY');

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
