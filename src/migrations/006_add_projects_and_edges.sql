-- Nervous Center Phase 1: Projects + Thought Edges tables
-- Evolves second-brain from flat thought store to directed graph

-- Projects table — first-class project entities
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  repo_path text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects (slug);

-- Reuse update_updated_at() trigger from 001_schema.sql
CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Thought edges table — typed directed relationships between thoughts
CREATE TABLE IF NOT EXISTS thought_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_thought_id uuid NOT NULL REFERENCES thoughts(id) ON DELETE CASCADE,
  to_thought_id uuid NOT NULL REFERENCES thoughts(id) ON DELETE CASCADE,
  edge_type text NOT NULL CHECK (edge_type IN (
    'relates_to', 'blocks', 'caused_by', 'inspired_by', 'contradicts', 'child_of'
  )),
  weight numeric NOT NULL DEFAULT 1.0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_edge UNIQUE (from_thought_id, to_thought_id, edge_type)
);

CREATE INDEX IF NOT EXISTS idx_thought_edges_from ON thought_edges (from_thought_id);
CREATE INDEX IF NOT EXISTS idx_thought_edges_to ON thought_edges (to_thought_id);
CREATE INDEX IF NOT EXISTS idx_thought_edges_type ON thought_edges (edge_type);

-- Add project_id FK to thoughts (nullable — backfilled in Phase 2)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'thoughts' AND column_name = 'project_id'
  ) THEN
    ALTER TABLE thoughts ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE SET NULL;
    CREATE INDEX idx_thoughts_project_id ON thoughts (project_id);
  END IF;
END $$;
