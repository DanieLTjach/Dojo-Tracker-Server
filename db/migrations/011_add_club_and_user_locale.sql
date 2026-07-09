-- Locale support: club default locale/country, and per-profile locale override.
ALTER TABLE club ADD COLUMN country TEXT NOT NULL DEFAULT 'UA';
ALTER TABLE club ADD COLUMN locale TEXT NOT NULL DEFAULT 'uk';
ALTER TABLE profile ADD COLUMN locale TEXT;
