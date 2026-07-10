CREATE TABLE smartCompassPairingCode (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gameId INTEGER NOT NULL REFERENCES game(id) ON DELETE CASCADE,
    codeHash TEXT NOT NULL UNIQUE,
    expiresAt TIMESTAMP NOT NULL,
    redeemedAt TIMESTAMP,
    createdAt TIMESTAMP NOT NULL,
    createdBy INTEGER NOT NULL REFERENCES user(id)
);

CREATE INDEX idx_smartCompassPairingCode_gameId ON smartCompassPairingCode(gameId);
CREATE INDEX idx_smartCompassPairingCode_expiresAt ON smartCompassPairingCode(expiresAt);

CREATE TABLE smartCompassSession (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gameId INTEGER NOT NULL REFERENCES game(id) ON DELETE CASCADE,
    pairingCodeId INTEGER NOT NULL REFERENCES smartCompassPairingCode(id) ON DELETE CASCADE,
    tokenHash TEXT NOT NULL UNIQUE,
    deviceLabel TEXT,
    expiresAt TIMESTAMP NOT NULL,
    revokedAt TIMESTAMP,
    lastUsedAt TIMESTAMP,
    createdAt TIMESTAMP NOT NULL,
    createdBy INTEGER NOT NULL REFERENCES user(id),
    modifiedAt TIMESTAMP NOT NULL,
    modifiedBy INTEGER NOT NULL REFERENCES user(id)
);

CREATE INDEX idx_smartCompassSession_gameId ON smartCompassSession(gameId);
CREATE INDEX idx_smartCompassSession_createdBy ON smartCompassSession(createdBy);
CREATE INDEX idx_smartCompassSession_expiresAt ON smartCompassSession(expiresAt);
