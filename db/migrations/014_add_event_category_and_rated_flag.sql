ALTER TABLE event ADD COLUMN isRated BOOL NOT NULL DEFAULT true;

CREATE TABLE eventCategory (
    category TEXT PRIMARY KEY,
    description TEXT
);

INSERT INTO eventCategory (category, description) VALUES
    ('EMA', 'Official European Mahjong Association tournament'),
    ('CLUB_TOURNAMENT', 'Internal club tournament'),
    ('LEAGUE', 'Club league / season play'),
    ('FRIENDLY', 'Casual or non-competitive event');

ALTER TABLE event ADD COLUMN category TEXT REFERENCES eventCategory(category);

UPDATE event SET isRated = 0 WHERE name IN ('Нерейтинг 2026', 'Тестовий Турнір');
