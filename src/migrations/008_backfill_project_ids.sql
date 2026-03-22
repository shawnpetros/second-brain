-- Phase 2: Backfill project_id on existing thoughts via topic/text matching
-- Maps thoughts to projects based on topic tags and raw_text patterns
-- Only updates thoughts where project_id IS NULL (safe to re-run)

-- second-brain / open-brain
UPDATE thoughts SET project_id = (SELECT id FROM projects WHERE slug = 'second-brain')
WHERE project_id IS NULL
  AND (
    topics && ARRAY['second brain', 'open brain', 'dashboard', 'MCP server', 'thought capture', 'brain hygiene']::text[]
    OR raw_text ILIKE '%second-brain%'
    OR raw_text ILIKE '%open brain%'
    OR raw_text ILIKE '%open-brain%'
  );

-- intel-app
UPDATE thoughts SET project_id = (SELECT id FROM projects WHERE slug = 'intel-app')
WHERE project_id IS NULL
  AND (
    topics && ARRAY['intel brief', 'competitive intelligence', 'GTM report']::text[]
    OR raw_text ILIKE '%intel-app%'
    OR raw_text ILIKE '%intel brief%'
  );

-- autobahnservicemke
UPDATE thoughts SET project_id = (SELECT id FROM projects WHERE slug = 'autobahnservicemke')
WHERE project_id IS NULL
  AND (
    topics && ARRAY['autobahn', 'auto repair', 'ShopGenie', 'booking dashboard']::text[]
    OR raw_text ILIKE '%autobahnservicemke%'
    OR raw_text ILIKE '%autobahn%'
  );

-- content-pipeline
UPDATE thoughts SET project_id = (SELECT id FROM projects WHERE slug = 'content-pipeline')
WHERE project_id IS NULL
  AND (
    topics && ARRAY['content pipeline', 'linkedin', 'content generation']::text[]
    OR raw_text ILIKE '%content-pipeline%'
  );

-- mealsgpt
UPDATE thoughts SET project_id = (SELECT id FROM projects WHERE slug = 'mealsgpt')
WHERE project_id IS NULL
  AND (
    topics && ARRAY['mealsgpt', 'meal planning']::text[]
    OR raw_text ILIKE '%mealsgpt%'
  );

-- aiskillsebook / kindling
UPDATE thoughts SET project_id = (SELECT id FROM projects WHERE slug = 'aiskillsebook')
WHERE project_id IS NULL
  AND (
    topics && ARRAY['ebook', 'kindling', 'visual redesign']::text[]
    OR raw_text ILIKE '%aiskillsebook%'
    OR raw_text ILIKE '%kindling%'
  );

-- petros-skills
UPDATE thoughts SET project_id = (SELECT id FROM projects WHERE slug = 'petros-skills')
WHERE project_id IS NULL
  AND (
    topics && ARRAY['skill changes', 'superpowers', 'stop framework']::text[]
    OR raw_text ILIKE '%petros-skills%'
  );

-- content-gen-harness-meta
UPDATE thoughts SET project_id = (SELECT id FROM projects WHERE slug = 'content-gen-harness-meta')
WHERE project_id IS NULL
  AND (
    topics && ARRAY['content-gen-harness-meta']::text[]
    OR raw_text ILIKE '%content-gen-harness-meta%'
  );

-- interview-prep
UPDATE thoughts SET project_id = (SELECT id FROM projects WHERE slug = 'interview-prep')
WHERE project_id IS NULL
  AND (
    topics && ARRAY['interview prep', 'system design', 'TeamSnap']::text[]
    OR raw_text ILIKE '%interview-prep%'
    OR raw_text ILIKE '%interview prep%'
  );

-- guerrillero
UPDATE thoughts SET project_id = (SELECT id FROM projects WHERE slug = 'guerrillero')
WHERE project_id IS NULL
  AND (
    topics && ARRAY['guerrillero']::text[]
    OR raw_text ILIKE '%guerrillero%'
  );

-- petrosindustries
UPDATE thoughts SET project_id = (SELECT id FROM projects WHERE slug = 'petrosindustries')
WHERE project_id IS NULL
  AND (
    topics && ARRAY['petros industries', 'product vision']::text[]
    OR raw_text ILIKE '%petrosindustries%'
    OR raw_text ILIKE '%petros industries%'
  );

-- mediascribe
UPDATE thoughts SET project_id = (SELECT id FROM projects WHERE slug = 'mediascribe')
WHERE project_id IS NULL
  AND (
    topics && ARRAY['mediascribe', 'media research', 'transcription']::text[]
    OR raw_text ILIKE '%mediascribe%'
  );

-- shawnpetros.com.v2
UPDATE thoughts SET project_id = (SELECT id FROM projects WHERE slug = 'shawnpetros-com-v2')
WHERE project_id IS NULL
  AND (
    topics && ARRAY['personal website', 'portfolio']::text[]
    OR raw_text ILIKE '%shawnpetros.com%'
  );
