ALTER TABLE event ADD COLUMN isRated BOOL NOT NULL DEFAULT true;

-- No description column: the frontend renders translated labels from its own i18n
-- catalog, so a copy here would only drift out of sync with it.
CREATE TABLE eventTag (
    tag TEXT PRIMARY KEY
);

INSERT INTO eventTag (tag) VALUES
    ('EMA'),
    ('CLUB_TOURNAMENT'),
    ('LEAGUE'),
    ('ONLINE');

CREATE TABLE eventToTag (
    eventId INTEGER NOT NULL REFERENCES event(id),
    tag TEXT NOT NULL REFERENCES eventTag(tag),
    createdAt TIMESTAMP NOT NULL,
    modifiedBy INTEGER NOT NULL REFERENCES user(id),
    PRIMARY KEY (eventId, tag)
);

CREATE INDEX idx_eventToTag_tag ON eventToTag(tag);

UPDATE event SET isRated = 0 WHERE name IN ('Нерейтинг 2026', 'Тестовий Турнір');
