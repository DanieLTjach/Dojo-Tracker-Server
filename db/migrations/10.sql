-- Fold tournament registration settings into the generic event config JSON.
-- Keep the legacy columns for one release so the migration remains rollback-safe.

UPDATE event
SET config = json_set(
    COALESCE(config, '{}'),
    '$.maxParticipants',
    maxParticipants
)
WHERE maxParticipants IS NOT NULL;

UPDATE event
SET config = json_set(
    COALESCE(config, '{}'),
    '$.registrationDeadline',
    registrationDeadline
)
WHERE registrationDeadline IS NOT NULL;
