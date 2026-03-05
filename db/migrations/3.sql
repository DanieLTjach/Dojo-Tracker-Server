CREATE TABLE profile (
    userId INTEGER PRIMARY KEY REFERENCES user(id),
    firstNameEn TEXT,
    lastNameEn TEXT,
    emaNumber TEXT UNIQUE,
    hideProfile BOOL NOT NULL DEFAULT false,
    modifiedAt TIMESTAMP NOT NULL,
    modifiedBy INTEGER NOT NULL REFERENCES user(id)
);

ALTER TABLE game ADD COLUMN tournamentHanchanNumber INTEGER;
ALTER TABLE game ADD COLUMN tournamentTableNumber INTEGER;
