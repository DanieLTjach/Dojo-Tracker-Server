ALTER TABLE clubTelegramTopics ADD COLUMN clubLogs TEXT;
ALTER TABLE clubTelegramTopics ADD COLUMN main TEXT;

CREATE TABLE clubPollConfig (
    clubId INTEGER PRIMARY KEY REFERENCES club(id),
    pollTitle TEXT NOT NULL,
    eventDays TEXT NOT NULL,
    sendDay INTEGER NOT NULL,
    sendTime TEXT NOT NULL,
    extraOptions TEXT,
    isActive INTEGER NOT NULL DEFAULT 1,
    createdAt TIMESTAMP NOT NULL,
    modifiedAt TIMESTAMP NOT NULL,
    modifiedBy INTEGER NOT NULL REFERENCES user(id)
);
