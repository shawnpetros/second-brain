-- Backfill status for existing rows after 002_add_status.sql
-- Action items stay 'untriaged' (the column default), everything else → 'active'

UPDATE thoughts
SET status = 'active'
WHERE thought_type != 'action_item'
  AND status = 'untriaged';
