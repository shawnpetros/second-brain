-- Add 'milestone' thought type for session summaries, wins, and accomplishments
-- This ALTER replaces the existing CHECK constraint with one that includes the new type

ALTER TABLE thoughts DROP CONSTRAINT IF EXISTS thoughts_thought_type_check;

ALTER TABLE thoughts ADD CONSTRAINT thoughts_thought_type_check
  CHECK (thought_type IN (
    'decision', 'insight', 'meeting', 'person_note',
    'idea', 'action_item', 'reflection', 'reference', 'milestone'
  ));
