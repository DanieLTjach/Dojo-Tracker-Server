CREATE TABLE IF NOT EXISTS post_comment_like (
    commentId INTEGER NOT NULL,
    userId INTEGER NOT NULL,
    createdAt TIMESTAMP NOT NULL,
    -- One like per user per comment, enforced by the key rather than a check
    -- on write, so a double tap can never double count.
    PRIMARY KEY (commentId, userId),
    FOREIGN KEY (commentId) REFERENCES post_comment(id) ON DELETE CASCADE,
    FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_post_comment_like_comment ON post_comment_like(commentId);
