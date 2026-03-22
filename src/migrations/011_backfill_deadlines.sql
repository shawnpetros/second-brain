-- Migration 011: Backfill deadline extraction for existing action items
-- This is a no-op migration marker. The actual backfill runs as a one-time
-- script (scripts/backfill-deadlines.ts) because it requires LLM calls
-- to re-extract metadata from existing thought text.
--
-- The briefing pipeline handles urgency scoring automatically each cycle,
-- so urgency_score doesn't need backfilling.
--
-- This migration just marks the backfill as "acknowledged" in schema_migrations.
SELECT 1;
