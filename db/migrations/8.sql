CREATE TABLE clubFollow (
    clubId INTEGER NOT NULL REFERENCES club(id),
    userId INTEGER NOT NULL REFERENCES user(id),
    createdAt TIMESTAMP NOT NULL,
    modifiedAt TIMESTAMP NOT NULL,
    modifiedBy INTEGER NOT NULL REFERENCES user(id),
    PRIMARY KEY (clubId, userId)
);

CREATE INDEX idx_clubFollow_userId ON clubFollow(userId);

-- Backfill: follow every existing ACTIVE membership so selectors don't change on deploy
INSERT INTO clubFollow (clubId, userId, createdAt, modifiedAt, modifiedBy)
SELECT clubId, userId, modifiedAt, modifiedAt, 0
FROM clubMembership
WHERE status = 'ACTIVE';
