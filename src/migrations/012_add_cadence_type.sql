-- Migration 012: Add 'cadence' thought type for recurring patterns
ALTER TABLE thoughts DROP CONSTRAINT IF EXISTS thoughts_thought_type_check;
ALTER TABLE thoughts ADD CONSTRAINT thoughts_thought_type_check
  CHECK (thought_type IN ('decision', 'insight', 'meeting', 'person_note', 'idea', 'action_item', 'reflection', 'reference', 'milestone', 'cadence'));
