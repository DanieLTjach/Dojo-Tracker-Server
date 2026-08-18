-- Per-game opt-out from full hand-detail entry.
--
-- The event-level `requireHandDetail` config is all-or-nothing and tied to how
-- the season/tournament was created, so an operator could never fall back to
-- plain han/fu for a single game. `enterHandDetail` moves the choice onto the
-- game row: the event flag still forces the tile editor, otherwise the
-- operator decides per game. Defaults to true (full hand score) so every new
-- game keeps the richer entry, and existing games read as if it was always on.
ALTER TABLE game ADD COLUMN enterHandDetail BOOL NOT NULL DEFAULT true;
