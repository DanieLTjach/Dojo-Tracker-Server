-- Per-club switch for the OpenSkill strength rating.
--
-- A small club's ranked list is mostly empty (nobody has reached the
-- provisional threshold yet), so its owner wants to hide the board entirely
-- rather than show a permanently-thin list. Defaults to true so every existing
-- club keeps its current behaviour.
ALTER TABLE clubSkillConfig ADD COLUMN isEnabled BOOL NOT NULL DEFAULT true;
