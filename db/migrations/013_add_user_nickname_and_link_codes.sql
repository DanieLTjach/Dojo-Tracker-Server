CREATE TABLE user_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegramUsername TEXT UNIQUE,
    telegramId INTEGER UNIQUE,
    name TEXT NOT NULL UNIQUE,
    nickname TEXT NOT NULL UNIQUE COLLATE NOCASE,
    createdAt TIMESTAMP NOT NULL,
    modifiedAt TIMESTAMP NOT NULL,
    modifiedBy INTEGER NOT NULL REFERENCES user(id),
    isActive BOOL NOT NULL DEFAULT false,
    isAdmin BOOL NOT NULL DEFAULT false,
    status TEXT REFERENCES userStatus(status) DEFAULT 'ACTIVE' NOT NULL
);

INSERT INTO user_new (
    id, telegramUsername, telegramId, name, nickname,
    createdAt, modifiedAt, modifiedBy, isActive, isAdmin, status
)
SELECT
    id, telegramUsername, telegramId, name,
    -- the SYSTEM user (id 0) has no Telegram username in existing databases
    CASE WHEN id = 0 THEN '@system' ELSE telegramUsername END,
    createdAt, modifiedAt, modifiedBy, isActive, isAdmin, status
FROM user;

DROP TABLE user;
ALTER TABLE user_new RENAME TO user;

CREATE TABLE authLinkCode (
    codeHash TEXT NOT NULL PRIMARY KEY,
    userId INTEGER NOT NULL UNIQUE REFERENCES user(id),
    createdAt TIMESTAMP NOT NULL,
    expiresAt TIMESTAMP NOT NULL
);

CREATE INDEX idx_auth_link_code_expires_at ON authLinkCode(expiresAt);
