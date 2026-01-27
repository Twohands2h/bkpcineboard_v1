-- ============================================
-- ENTITIES TABLE
-- Film-first: Characters, Environments, Assets
-- Project-scoped memory system
-- ============================================

CREATE TABLE entities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Core identity
  type TEXT NOT NULL CHECK (type IN ('character', 'environment', 'asset')),
  name TEXT NOT NULL,
  description TEXT,
  
  -- System-generated slug for future @references
  -- IMPORTANT: Generated ONLY on create, NOT auto-updated on rename
  -- This ensures @references remain stable even if entity is renamed
  slug TEXT NOT NULL,
  
  -- Narrative ordering (optional, for future use)
  -- Allows manual reordering of entities within project
  order_index INTEGER,
  
  -- Core semantic memory field
  -- May be empty in v1 UI, but conceptually central to Film Memory System
  master_prompt TEXT,
  
  -- Reference images metadata (future UI)
  reference_images JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(project_id, slug),
  CHECK (char_length(name) >= 1 AND char_length(name) <= 100)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_entities_project_id ON entities(project_id);
CREATE INDEX idx_entities_type ON entities(type);
CREATE INDEX idx_entities_project_type ON entities(project_id, type);
CREATE INDEX idx_entities_order ON entities(project_id, order_index) 
  WHERE order_index IS NOT NULL;

-- ============================================
-- AUTO-UPDATE TRIGGER
-- ============================================

-- NOTE: This trigger depends on update_updated_at_column() 
-- function created in migration 001 (20260126000001_initial_schema.sql)
CREATE TRIGGER update_entities_updated_at
  BEFORE UPDATE ON entities
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- COMMENTS (Film-First Philosophy)
-- ============================================

COMMENT ON TABLE entities IS 'Project-scoped memory system: Characters, Environments, Assets for AI filmmaking';
COMMENT ON COLUMN entities.type IS 'Entity type: character (people/creatures), environment (locations), asset (props/objects/FX)';
COMMENT ON COLUMN entities.slug IS 'System-generated stable reference for @mentions (future). Generated ONLY on create, NOT updated on rename to maintain reference stability.';
COMMENT ON COLUMN entities.order_index IS 'Optional narrative ordering within project. NULL means no explicit order. Future feature for manual reordering.';
COMMENT ON COLUMN entities.master_prompt IS 'Core semantic memory for the entity. May be empty in v1. Central for AI consistency and shotlist coherence.';
COMMENT ON COLUMN entities.reference_images IS 'JSONB array of reference image metadata. Empty array in v1, populated in future UI.';

-- ============================================
-- RLS (DISABLED - Auth comes Week 2+)
-- ============================================

ALTER TABLE entities DISABLE ROW LEVEL SECURITY;

-- Note: RLS will be enabled when auth is implemented
-- Policy will enforce: users can only access entities from their own projects
-- Future tables (shotlist+) will use RLS enabled with permissive policy