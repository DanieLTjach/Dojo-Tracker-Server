-- Editing a post records when it last changed, so the UI can mark it as edited.
-- NULL means "never edited" rather than "edited at creation time".
ALTER TABLE post ADD COLUMN editedAt TIMESTAMP;

CREATE TABLE IF NOT EXISTS post_comment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    postId INTEGER NOT NULL,
    authorId INTEGER NOT NULL,
    text TEXT NOT NULL,
    createdAt TIMESTAMP NOT NULL,
    editedAt TIMESTAMP,
    FOREIGN KEY (postId) REFERENCES post(id) ON DELETE CASCADE,
    FOREIGN KEY (authorId) REFERENCES user(id) ON DELETE CASCADE
);

-- Comments are always read as "the thread for one post, oldest first", which is
-- exactly this index; it also covers the per-post count on the feed queries.
CREATE INDEX IF NOT EXISTS idx_post_comment_post ON post_comment(postId, createdAt);
