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

ALTER TABLE club ADD COLUMN logoUrl TEXT;
