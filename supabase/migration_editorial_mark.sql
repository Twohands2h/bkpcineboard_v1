-- Migration: editorial marks per take
-- Backward compatible: NULL = unmarked

ALTER TABLE takes
  ADD COLUMN IF NOT EXISTS editorial_mark text
    CHECK (editorial_mark IN ('select', 'alt', 'reject'))
    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS editorial_note text
    DEFAULT NULL;
