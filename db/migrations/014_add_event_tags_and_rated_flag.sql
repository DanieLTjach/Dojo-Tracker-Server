ALTER TABLE event ADD COLUMN isRated BOOL NOT NULL DEFAULT true;

CREATE TABLE eventTag (
    tag TEXT PRIMARY KEY,
    description TEXT
);

INSERT INTO eventTag (tag, description) VALUES
    ('EMA', 'Official European Mahjong Association tournament'),
    ('CLUB_TOURNAMENT', 'Internal club tournament'),
    ('LEAGUE', 'Club league / season play'),
    ('FRIENDLY', 'Casual or non-competitive event'),
    ('ONLINE', 'Played online');

CREATE TABLE eventToTag (
    eventId INTEGER NOT NULL REFERENCES event(id),
    tag TEXT NOT NULL REFERENCES eventTag(tag),
    createdAt TIMESTAMP NOT NULL,
    modifiedBy INTEGER NOT NULL REFERENCES user(id),
    PRIMARY KEY (eventId, tag)
);

CREATE INDEX idx_eventToTag_tag ON eventToTag(tag);

UPDATE event SET isRated = 0 WHERE name IN ('Нерейтинг 2026', 'Тестовий Турнір');
