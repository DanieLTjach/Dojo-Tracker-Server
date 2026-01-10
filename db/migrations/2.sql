-- Migration 2: Add description field to event table

ALTER TABLE event ADD COLUMN description TEXT;
