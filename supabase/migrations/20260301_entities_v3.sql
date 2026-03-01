-- Entities v3: single table with JSONB content
-- DROP+CREATE to force PostgREST schema cache refresh via supabase db push
DROP TABLE IF EXISTS entities CASCADE;

CREATE TABLE entities (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  uuid NOT NULL,
    name        text NOT NULL DEFAULT 'Untitled Entity',
    entity_type text NOT NULL DEFAULT 'character'
        CHECK (entity_type IN ('character', 'environment', 'prop', 'cinematography')),
    content     jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_entities_project_id ON entities(project_id);

CREATE OR REPLACE FUNCTION update_entities_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS entities_updated_at ON entities;
CREATE TRIGGER entities_updated_at
    BEFORE UPDATE ON entities
    FOR EACH ROW
    EXECUTE FUNCTION update_entities_updated_at();

ALTER TABLE entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entities_select_all" ON entities FOR SELECT USING (true);
CREATE POLICY "entities_insert_all" ON entities FOR INSERT WITH CHECK (true);
CREATE POLICY "entities_update_all" ON entities FOR UPDATE USING (true);
CREATE POLICY "entities_delete_all" ON entities FOR DELETE USING (true);
