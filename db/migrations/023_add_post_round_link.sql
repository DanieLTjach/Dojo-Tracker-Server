ALTER TABLE post ADD COLUMN roundNumber INTEGER;
CREATE INDEX IF NOT EXISTS idx_post_game_round ON post(gameId, roundNumber);
