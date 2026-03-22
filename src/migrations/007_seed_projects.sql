-- Phase 2: Seed projects table with active repos
-- ON CONFLICT DO NOTHING makes this idempotent

INSERT INTO projects (name, slug, repo_path, description) VALUES
  ('Second Brain', 'second-brain', '/Users/shawnpetros/projects/second-brain', 'Open Brain MCP server + visual dashboard — the nervous center'),
  ('Intel App', 'intel-app', '/Users/shawnpetros/projects/intel-app', 'AI-powered competitive intelligence briefing pipeline'),
  ('Autobahn Service MKE', 'autobahnservicemke', '/Users/shawnpetros/projects/autobahnservicemke', 'Auto repair shop website — client project'),
  ('Content Pipeline', 'content-pipeline', '/Users/shawnpetros/projects/content-pipeline', 'LinkedIn content generation and scheduling pipeline'),
  ('MealsGPT', 'mealsgpt', '/Users/shawnpetros/projects/mealsgpt.com', 'AI meal planning app'),
  ('shawnpetros.com v2', 'shawnpetros-com-v2', '/Users/shawnpetros/projects/shawnpetros.com.v2', 'Personal website rebuild'),
  ('AI Skills Ebook', 'aiskillsebook', '/Users/shawnpetros/projects/aiskillsebook', 'Kindling — AI skills ebook and landing page'),
  ('Petros Skills', 'petros-skills', '/Users/shawnpetros/projects/petros-skills', 'Superpowers skill library for Claude Code'),
  ('Content Gen Harness', 'content-gen-harness-meta', '/Users/shawnpetros/projects/content-gen-harness-meta', 'Project-aware content generation harness'),
  ('Petros Industries', 'petrosindustries', '/Users/shawnpetros/projects/petrosindustries.com', 'Business entity website'),
  ('Guerrillero', 'guerrillero', '/Users/shawnpetros/projects/guerrillero', 'Guerrillero project'),
  ('Interview Prep', 'interview-prep', '/Users/shawnpetros/projects/interview-prep', 'Technical interview preparation'),
  ('MediaScribe', 'mediascribe', '/Users/shawnpetros/projects/mediascribe', 'Media transcription and research tool')
ON CONFLICT (slug) DO NOTHING;
