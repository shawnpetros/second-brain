-- Open Brain Schema v1
-- Run this in Supabase SQL Editor (or any Postgres 15+ with pgvector)

-- Enable pgvector extension
create extension if not exists vector;

-- Primary thoughts table
create table thoughts (
  id            uuid primary key default gen_random_uuid(),
  raw_text      text not null,
  embedding     vector(1536) not null,
  thought_type  text not null check (thought_type in (
                  'decision', 'insight', 'meeting', 'person_note',
                  'idea', 'action_item', 'reflection', 'reference'
                )),
  people        text[] not null default '{}',
  topics        text[] not null default '{}',
  action_items  text[] not null default '{}',
  source        text not null default 'manual',
  source_ref    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- HNSW index for fast cosine similarity search on embeddings
create index thoughts_embedding_idx
  on thoughts using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- Filtered query indexes
create index thoughts_type_idx on thoughts (thought_type);
create index thoughts_created_idx on thoughts (created_at desc);
create index thoughts_people_idx on thoughts using gin (people);
create index thoughts_topics_idx on thoughts using gin (topics);

-- Auto-update updated_at on row modification
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger thoughts_updated_at
  before update on thoughts
  for each row execute function update_updated_at();

-- Row-level security (enable if using Supabase auth)
-- alter table thoughts enable row level security;
-- create policy "Allow all for anon" on thoughts for all using (true);
