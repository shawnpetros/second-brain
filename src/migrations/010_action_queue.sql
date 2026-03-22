-- Migration 010: Autonomous Action Queue schema
-- Adds pending_actions, permission_overrides, push_subscriptions tables
-- Adds urgency/snooze/deadline columns to thoughts

-- 1. New columns on thoughts
ALTER TABLE thoughts ADD COLUMN IF NOT EXISTS urgency_score FLOAT DEFAULT 0;
ALTER TABLE thoughts ADD COLUMN IF NOT EXISTS urgency_updated_at TIMESTAMPTZ;
ALTER TABLE thoughts ADD COLUMN IF NOT EXISTS action_classification TEXT;
ALTER TABLE thoughts ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ;
ALTER TABLE thoughts ADD COLUMN IF NOT EXISTS snooze_count INT DEFAULT 0;
ALTER TABLE thoughts ADD COLUMN IF NOT EXISTS deadline TIMESTAMPTZ;

-- 2. pending_actions table
CREATE TABLE IF NOT EXISTS pending_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thought_id UUID NOT NULL REFERENCES thoughts(id) ON DELETE CASCADE,
  briefing_id UUID REFERENCES briefings(id),
  action_type TEXT NOT NULL,
  permission_tier TEXT NOT NULL CHECK (permission_tier IN ('auto', 'staged', 'never')),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN (
    'planned', 'executing', 'staged', 'approved', 'rejected',
    'expired', 'failed', 'blocked', 'abandoned', 'dismissed'
  )),
  stakes TEXT CHECK (stakes IN ('low', 'medium', 'high')),
  model_used TEXT,
  prompt_summary TEXT NOT NULL,
  prompt_adjustments TEXT,
  result TEXT,
  result_metadata JSONB DEFAULT '{}',
  urgency_score FLOAT DEFAULT 0,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  reviewed_at TIMESTAMPTZ,
  retry_count INT DEFAULT 0,
  failure_reason TEXT,
  parent_action_id UUID REFERENCES pending_actions(id),
  flagged BOOLEAN DEFAULT FALSE,
  flag_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_actions_status ON pending_actions(status);
CREATE INDEX IF NOT EXISTS idx_pending_actions_thought ON pending_actions(thought_id);
CREATE INDEX IF NOT EXISTS idx_pending_actions_briefing ON pending_actions(briefing_id);

-- Prevent duplicate active actions for the same thought
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_actions_active_thought
  ON pending_actions(thought_id)
  WHERE status IN ('planned', 'executing', 'staged');

-- Reuse existing update_updated_at() trigger from 001_schema.sql
DROP TRIGGER IF EXISTS update_pending_actions_updated_at ON pending_actions;
CREATE TRIGGER update_pending_actions_updated_at
  BEFORE UPDATE ON pending_actions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3. permission_overrides table
CREATE TABLE IF NOT EXISTS permission_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT UNIQUE NOT NULL,
  override_tier TEXT NOT NULL CHECK (override_tier IN ('auto', 'staged')),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT 'user'
);

-- 4. push_subscriptions table
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  subscription JSONB NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
