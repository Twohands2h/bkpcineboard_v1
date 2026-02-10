-- ============================================================
-- CINEBOARD — BLOCCO 2: Shot Decision Schema Migration
-- ============================================================
-- Status: CANONICAL
-- Scope: Add approved_take_id to shots table
-- Prerequisite: decision_notes table already exists
-- ============================================================
-- After this migration, schema is FROZEN.
-- No further DB changes without a new milestone.
-- ============================================================

-- 1. Add approved_take_id column to shots
--    NULL = UNDECIDED, NOT NULL = DECIDED
--    GRACE is never persisted (lives in RAM only)
ALTER TABLE shots
ADD COLUMN approved_take_id uuid NULL
REFERENCES takes(id) ON DELETE SET NULL;

-- 2. Index for fast lookup
CREATE INDEX idx_shots_approved_take_id
ON shots(approved_take_id)
WHERE approved_take_id IS NOT NULL;

-- 3. Index on decision_notes for shot lookups
--    (decision_notes already exists with parent_id + parent_type)
CREATE INDEX idx_decision_notes_shot
ON decision_notes(parent_id, created_at)
WHERE parent_type = 'shot';

-- 4. RLS policy for shots update (permissive, no auth)
--    Matches existing pattern: permissive ALL
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'shots'
    AND policyname = 'shots_update_permissive'
  ) THEN
    CREATE POLICY shots_update_permissive ON shots
    FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 5. RLS policy for decision_notes insert (permissive, no auth)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'decision_notes'
    AND policyname = 'decision_notes_insert_permissive'
  ) THEN
    CREATE POLICY decision_notes_insert_permissive ON decision_notes
    FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- 6. RLS policy for decision_notes select (permissive, no auth)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'decision_notes'
    AND policyname = 'decision_notes_select_permissive'
  ) THEN
    CREATE POLICY decision_notes_select_permissive ON decision_notes
    FOR SELECT USING (true);
  END IF;
END $$;
