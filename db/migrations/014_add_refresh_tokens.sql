CREATE TABLE refreshToken (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    tokenHash TEXT NOT NULL UNIQUE,
    familyId TEXT NOT NULL,
    expiresAt TIMESTAMP NOT NULL,
    createdAt TIMESTAMP NOT NULL,
    rotatedAt TIMESTAMP,
    revokedAt TIMESTAMP
);

CREATE INDEX idx_refresh_token_user_id ON refreshToken(userId);
CREATE INDEX idx_refresh_token_family_id ON refreshToken(familyId);
CREATE INDEX idx_refresh_token_expires_at ON refreshToken(expiresAt);
