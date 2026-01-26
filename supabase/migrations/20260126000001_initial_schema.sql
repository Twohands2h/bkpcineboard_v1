-- ============================================
-- CINEBOARD - INITIAL SCHEMA (FILM-FIRST)
-- ============================================
-- Migration: 001
-- Description: Projects table (auth comes later)
-- Date: 2026-01-26
-- Philosophy: Film exists independently of user

-- ============================================
-- ENABLE EXTENSIONS
-- ============================================

-- UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PROJECTS TABLE
-- ============================================

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Ownership (nullable - auth comes in Week 2+)
  owner_id UUID,
  
  -- Film identity
  title TEXT NOT NULL,
  logline TEXT,
  duration_seconds INTEGER, -- Film duration in seconds
  status TEXT DEFAULT 'planning' CHECK (status IN ('planning', 'production', 'complete')),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

-- Fast lookup by owner (when auth is added)
CREATE INDEX idx_projects_owner_id ON projects(owner_id);

-- Fast lookup by status
CREATE INDEX idx_projects_status ON projects(status);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- RLS DISABLED temporaneamente (auth non implementato)
-- Verrà abilitato in migration successiva con auth
ALTER TABLE projects DISABLE ROW LEVEL SECURITY;

-- ============================================
-- TRIGGER: Auto-update updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE projects IS 'Film projects - films exist independently of users';
COMMENT ON COLUMN projects.owner_id IS 'User ownership - nullable until auth implementation';
COMMENT ON COLUMN projects.duration_seconds IS 'Film duration in seconds';
COMMENT ON COLUMN projects.status IS 'Narrative lifecycle: planning | production | complete';

-- ============================================
-- NOTES FOR FUTURE MIGRATIONS
-- ============================================

-- Migration 002 (Week 2+) will:
-- 1. Add foreign key: owner_id → auth.users(id)
-- 2. Enable RLS
-- 3. Add RLS policies:
--    - USING (auth.uid() = owner_id)
--    - WITH CHECK (auth.uid() = owner_id)


