CREATE TABLE authProvider (
    provider TEXT NOT NULL PRIMARY KEY
);

INSERT INTO authProvider (provider) VALUES ('GOOGLE'), ('TELEGRAM');

CREATE TABLE authProviderIdentity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL REFERENCES user(id),
    provider TEXT NOT NULL REFERENCES authProvider(provider),
    providerUserId TEXT NOT NULL,
    displayName TEXT,
    email TEXT,
    username TEXT,
    createdAt TIMESTAMP NOT NULL,
    modifiedAt TIMESTAMP NOT NULL,
    UNIQUE (provider, providerUserId),
    UNIQUE (userId, provider)
);

CREATE INDEX idx_auth_provider_identity_user_id ON authProviderIdentity(userId);

INSERT INTO authProviderIdentity (
    userId,
    provider,
    providerUserId,
    displayName,
    email,
    username,
    createdAt,
    modifiedAt
)
SELECT
    id,
    'TELEGRAM',
    CAST(telegramId AS TEXT),
    name,
    NULL,
    telegramUsername,
    createdAt,
    modifiedAt
FROM user
WHERE telegramId IS NOT NULL;
