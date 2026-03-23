-- Migration 013: Add agent_id to pending_actions + agents table prep
-- Follows the Extension Principle: new table, reference via FK

-- Agent ID on pending_actions (nullable, defaults to penny)
ALTER TABLE pending_actions ADD COLUMN IF NOT EXISTS agent_id TEXT DEFAULT 'penny';

-- Agents table for future multi-agent routing
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  soul_md TEXT NOT NULL,
  model_preference TEXT DEFAULT 'claude-sonnet-4-6',
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Penny as the default agent
INSERT INTO agents (id, name, role, soul_md, model_preference)
VALUES (
  'penny',
  'Penny',
  'COO — orchestration, triage, briefing, daily plate, the voice',
  'See SOUL.md',
  'claude-sonnet-4-6'
) ON CONFLICT (id) DO NOTHING;
