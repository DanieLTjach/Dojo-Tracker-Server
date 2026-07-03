-- Rotating refresh tokens (see db/data/docs/auth-refresh-token-plan.md).
CREATE TABLE refreshToken (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL REFERENCES user(id),
    tokenHash TEXT NOT NULL UNIQUE,
    familyId TEXT NOT NULL,
    expiresAt TIMESTAMP NOT NULL,
    createdAt TIMESTAMP NOT NULL,
    rotatedAt TIMESTAMP,
    revokedAt TIMESTAMP
);

CREATE INDEX idx_refreshToken_userId ON refreshToken(userId);
CREATE INDEX idx_refreshToken_familyId ON refreshToken(familyId);
