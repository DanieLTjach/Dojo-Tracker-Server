-- Indexes for querying achievement unlocks by source game and source event.

CREATE INDEX idx_automaticAchievementState_sourceGameId ON automaticAchievementState(sourceGameId);
CREATE INDEX idx_automaticAchievementState_sourceEventId ON automaticAchievementState(sourceEventId);
