ALTER TABLE clubTelegramTopics ADD COLUMN clubLogs TEXT;
ALTER TABLE clubTelegramTopics ADD COLUMN main TEXT;

CREATE TABLE clubPollConfig (
    clubId INTEGER PRIMARY KEY REFERENCES club(id),
    pollTitle TEXT NOT NULL,
    eventDays TEXT NOT NULL,
    sendDay INTEGER NOT NULL,
    sendTime TEXT NOT NULL,
    extraOptions TEXT,
    isActive BOOL NOT NULL DEFAULT true,
    createdAt TIMESTAMP NOT NULL,
    modifiedAt TIMESTAMP NOT NULL,
    modifiedBy INTEGER NOT NULL REFERENCES user(id)
);

UPDATE gameRules SET uma = '[15,5,-5,-15]' WHERE numberOfPlayers = 4;
UPDATE gameRules SET uma = '[15,0,-15]' WHERE numberOfPlayers = 3;
UPDATE gameRules SET uma = '[[24,-2,-6,-16],[16,8,-8,-16],[16,6,2,-24]]' WHERE name = 'Сезон 6 йонма';
