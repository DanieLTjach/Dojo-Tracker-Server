-- Tournament seating is persisted as regular games. Remove the obsolete static
-- seating payload from event info, collapsing pairing-only objects to NULL.
UPDATE event
SET info = NULLIF(json_remove(info, '$.pairings'), '{}')
WHERE info IS NOT NULL
  AND json_type(info, '$.pairings') IS NOT NULL;
