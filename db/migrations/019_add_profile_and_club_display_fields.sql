-- Everything a member fills in about themselves, plus the club logo. Birthdays
-- are three integer parts rather than a date so a hidden year does not force a
-- sentinel value into the other two; `hideBirthYear` strips the year server-side.
ALTER TABLE profile ADD COLUMN avatarUrl TEXT;
ALTER TABLE profile ADD COLUMN statusLine TEXT;
ALTER TABLE profile ADD COLUMN birthDay INTEGER CHECK (birthDay IS NULL OR (birthDay >= 1 AND birthDay <= 31));
ALTER TABLE profile ADD COLUMN birthMonth INTEGER CHECK (birthMonth IS NULL OR (birthMonth >= 1 AND birthMonth <= 12));
ALTER TABLE profile ADD COLUMN birthYear INTEGER;
ALTER TABLE profile ADD COLUMN hideBirthYear INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profile ADD COLUMN city TEXT;
ALTER TABLE profile ADD COLUMN favouriteYaku TEXT;
ALTER TABLE profile ADD COLUMN favouriteTile TEXT;
ALTER TABLE profile ADD COLUMN discord TEXT;
ALTER TABLE profile ADD COLUMN majsoulAccount TEXT;
ALTER TABLE profile ADD COLUMN tenhouAccount TEXT;

-- Self-reported Mahjong Soul ranks. Yonma and sanma are ranked separately in
-- game, so they are two independent columns rather than one. Stored as a code
-- ('expert_3'), never a display name: the mini-app localizes the tier and the
-- in-game names differ between clients.
ALTER TABLE profile ADD COLUMN majsoulRankYonma TEXT;
ALTER TABLE profile ADD COLUMN majsoulRankSanma TEXT;

-- Per-profile theme override ('auto' | 'light' | 'dark').
ALTER TABLE profile ADD COLUMN theme TEXT;

ALTER TABLE club ADD COLUMN logoUrl TEXT;
