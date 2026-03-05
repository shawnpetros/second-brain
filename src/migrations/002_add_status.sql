-- Add status column for task lifecycle management
-- Allows thoughts (especially action_items) to be triaged, tracked, and completed

ALTER TABLE thoughts
  ADD COLUMN status text NOT NULL DEFAULT 'untriaged'
  CHECK (status IN ('untriaged', 'active', 'completed', 'skipped'));

-- Index for fast status-based queries (e.g. "show me all untriaged tasks")
CREATE INDEX thoughts_status_idx ON thoughts (status);

-- Composite index for the common query: action_items filtered by status
CREATE INDEX thoughts_type_status_idx ON thoughts (thought_type, status);
