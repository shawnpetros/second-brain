-- Phase 5: Briefings table for morning briefing pipeline
-- Stores Claude-synthesized daily briefings from brain graph traversal

CREATE TABLE IF NOT EXISTS briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  raw_data jsonb NOT NULL DEFAULT '{}',
  model text NOT NULL DEFAULT 'unknown',
  cost_usd numeric,
  tokens_used integer,
  thought_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_briefings_created ON briefings (created_at DESC);
