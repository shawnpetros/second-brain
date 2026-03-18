-- Add services table for business tool/service inventory tracking
-- Structured data (no embeddings) — queried via MCP tools

CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL CHECK (category IN (
    'hosting', 'database', 'auth', 'ai', 'email', 'payments',
    'cms', 'automation', 'analytics', 'storage', 'communication', 'scheduling', 'other'
  )),
  billing_model text NOT NULL CHECK (billing_model IN (
    'free', 'plan', 'per-token', 'per-transaction', 'per-email',
    'per-subscriber', 'per-message', 'per-compute', 'per-storage', 'usage', 'other'
  )),
  monthly_cost numeric,
  projects text[] NOT NULL DEFAULT '{}'::text[],
  notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'evaluating')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_services_category ON services (category);
CREATE INDEX idx_services_status ON services (status);
CREATE INDEX idx_services_projects ON services USING GIN (projects);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_services_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER services_updated_at
  BEFORE UPDATE ON services
  FOR EACH ROW
  EXECUTE FUNCTION update_services_updated_at();
