-- Photo posts with their images, likes and comment threads.
--
-- A post optionally points at a game, and at one round within it, so a hand
-- photo can be shown next to the hand it came from. Both links are nullable:
-- most posts are just club photos.

CREATE TABLE IF NOT EXISTS post (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    authorId INTEGER NOT NULL,
    clubId INTEGER,
    gameId INTEGER,
    roundNumber INTEGER,
    text TEXT,
    createdAt TIMESTAMP NOT NULL,
    -- NULL means "never edited" rather than "edited at creation time".
    editedAt TIMESTAMP,
    FOREIGN KEY (authorId) REFERENCES user(id) ON DELETE CASCADE,
    FOREIGN KEY (clubId) REFERENCES club(id) ON DELETE SET NULL,
    FOREIGN KEY (gameId) REFERENCES game(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS post_image (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    postId INTEGER NOT NULL,
    url TEXT NOT NULL,
    width INTEGER,
    height INTEGER,
    sortOrder INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (postId) REFERENCES post(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS post_like (
    postId INTEGER NOT NULL,
    userId INTEGER NOT NULL,
    createdAt TIMESTAMP NOT NULL,
    -- One like per user per post, enforced by the key rather than a check on
    -- write, so a double tap can never double count.
    PRIMARY KEY (postId, userId),
    FOREIGN KEY (postId) REFERENCES post(id) ON DELETE CASCADE,
    FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
);

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

CREATE TABLE IF NOT EXISTS post_comment_like (
    commentId INTEGER NOT NULL,
    userId INTEGER NOT NULL,
    createdAt TIMESTAMP NOT NULL,
    PRIMARY KEY (commentId, userId),
    FOREIGN KEY (commentId) REFERENCES post_comment(id) ON DELETE CASCADE,
    FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_post_author ON post(authorId);
CREATE INDEX IF NOT EXISTS idx_post_club ON post(clubId);
CREATE INDEX IF NOT EXISTS idx_post_game_round ON post(gameId, roundNumber);
CREATE INDEX IF NOT EXISTS idx_post_image_post ON post_image(postId);
-- Comments are always read as "the thread for one post, oldest first", which is
-- exactly this index; it also covers the per-post count on the feed queries.
CREATE INDEX IF NOT EXISTS idx_post_comment_post ON post_comment(postId, createdAt);
CREATE INDEX IF NOT EXISTS idx_post_comment_like_comment ON post_comment_like(commentId);
