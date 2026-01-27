-- ============================================
-- MIGRATION 003: Shotlist and Shots
-- CineBoard - AI Film Memory System
-- ============================================
--
-- Architecture:
--   Project (1) ──── (1) Shotlist ──── (N) Shots
--
-- Shotlist = narrative document (explicit entity, 1:1 with Project for MVP)
-- Shot = narrative node (NOT generation, NOT workspace)
--
-- Entity references stored as JSONB array:
--   [{ slug: string, role?: string, context_note?: string }]
--
-- Board connection (board_id) is nullable placeholder for future.
-- ============================================

-- ============================================
-- TABLE: shotlists
-- ============================================

CREATE TABLE IF NOT EXISTS public.shotlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  
  title TEXT NOT NULL DEFAULT 'Main Shotlist',
  description TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shotlists_project_id ON public.shotlists(project_id);

CREATE TRIGGER update_shotlists_updated_at
  BEFORE UPDATE ON public.shotlists
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.shotlists ENABLE ROW LEVEL SECURITY;

-- Temporary permissive policy (dev phase, replace with auth-based policy later)
CREATE POLICY "Allow all access to shotlists" ON public.shotlists
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- TABLE: shots
-- ============================================

CREATE TABLE IF NOT EXISTS public.shots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shotlist_id UUID NOT NULL REFERENCES public.shotlists(id) ON DELETE CASCADE,
  
  order_index INTEGER NOT NULL DEFAULT 0,
  shot_number TEXT NOT NULL DEFAULT '1.1',
  
  title TEXT,
  description TEXT,
  shot_type TEXT,
  
  entity_references JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  status TEXT NOT NULL DEFAULT 'planning'
    CHECK (status IN ('planning', 'in_progress', 'review', 'done')),
  
  board_id UUID,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shots_shotlist_id ON public.shots(shotlist_id);
CREATE INDEX IF NOT EXISTS idx_shots_order ON public.shots(shotlist_id, order_index);
CREATE INDEX IF NOT EXISTS idx_shots_status ON public.shots(status);
CREATE INDEX IF NOT EXISTS idx_shots_entity_refs ON public.shots USING GIN (entity_references);

CREATE TRIGGER update_shots_updated_at
  BEFORE UPDATE ON public.shots
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.shots ENABLE ROW LEVEL SECURITY;

-- Temporary permissive policy (dev phase, replace with auth-based policy later)
CREATE POLICY "Allow all access to shots" ON public.shots
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- END MIGRATION 003
-- ============================================