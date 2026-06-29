CREATE TABLE clubUsageAccount (
    clubId INTEGER PRIMARY KEY REFERENCES club(id),
    creditsBalance INTEGER NOT NULL DEFAULT 10000,
    overdraftCutoff INTEGER NOT NULL DEFAULT -1000,
    overdraftMultiplier INTEGER NOT NULL DEFAULT 2,
    isEnforced BOOL NOT NULL DEFAULT true,
    createdAt TIMESTAMP NOT NULL,
    modifiedAt TIMESTAMP NOT NULL,
    modifiedBy INTEGER NOT NULL REFERENCES user(id)
);

CREATE TABLE clubUsageDaily (
    clubId INTEGER NOT NULL REFERENCES club(id),
    usageDate TEXT NOT NULL,
    action TEXT NOT NULL,
    actionCount INTEGER NOT NULL DEFAULT 0,
    baseCredits INTEGER NOT NULL DEFAULT 0,
    chargedCredits INTEGER NOT NULL DEFAULT 0,
    createdAt TIMESTAMP NOT NULL,
    modifiedAt TIMESTAMP NOT NULL,
    modifiedBy INTEGER NOT NULL REFERENCES user(id),
    PRIMARY KEY (clubId, usageDate, action)
);

CREATE TABLE clubUsageAdjustment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clubId INTEGER NOT NULL REFERENCES club(id),
    type TEXT NOT NULL CHECK (type IN ('CREDIT_ADJUSTMENT', 'OVERDRAFT_CUTOFF_UPDATE')),
    creditsDelta INTEGER,
    previousCreditsBalance INTEGER NOT NULL,
    newCreditsBalance INTEGER NOT NULL,
    previousOverdraftCutoff INTEGER NOT NULL,
    newOverdraftCutoff INTEGER NOT NULL,
    reason TEXT NOT NULL,
    externalReference TEXT,
    createdAt TIMESTAMP NOT NULL,
    createdBy INTEGER NOT NULL REFERENCES user(id)
);
CREATE INDEX idx_clubUsageDaily_clubId_date ON clubUsageDaily(clubId, usageDate);
CREATE INDEX idx_clubUsageAdjustment_clubId_createdAt ON clubUsageAdjustment(clubId, createdAt);

INSERT INTO clubUsageAccount (
    clubId,
    creditsBalance,
    overdraftCutoff,
    overdraftMultiplier,
    isEnforced,
    createdAt,
    modifiedAt,
    modifiedBy
)
SELECT
    id,
    10000,
    -1000,
    2,
    1,
    '2026-01-01T00:00:00.000Z',
    '2026-01-01T00:00:00.000Z',
    0
FROM club;
