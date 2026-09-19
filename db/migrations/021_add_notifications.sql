CREATE TABLE IF NOT EXISTS notification (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    type TEXT NOT NULL,          -- POST_LIKE | POST_COMMENT | COMMENT_LIKE
                                 -- | ACHIEVEMENT_UNLOCK | SYSTEM
    actorId INTEGER REFERENCES user(id) ON DELETE CASCADE,
    postId INTEGER REFERENCES post(id) ON DELETE CASCADE,
    commentId INTEGER REFERENCES post_comment(id) ON DELETE CASCADE,
    achievementCode TEXT,
    scope TEXT,
    payload TEXT,                -- JSON for SYSTEM announcements
    readAt TIMESTAMP,
    createdAt TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_user ON notification(userId, createdAt DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_achievement
    ON notification(userId, achievementCode, scope)
    WHERE type = 'ACHIEVEMENT_UNLOCK';
