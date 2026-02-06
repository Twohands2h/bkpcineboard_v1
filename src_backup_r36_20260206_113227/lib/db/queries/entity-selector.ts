'use server'

import { createClient } from '@/lib/supabase/server'

// ============================================
// TYPES
// ============================================

export type EntityType = 'character' | 'environment' | 'asset'

export interface EntitySummary {
  id: string
  name: string
  slug: string
  entity_type: EntityType
  master_prompt: string | null
  reference_images: string[] | null
}

// ============================================
// QUERIES
// ============================================

/**
 * Get all entities for a project, optionally filtered by type
 */
export async function getProjectEntities(
  projectId: string,
  entityType?: EntityType
): Promise<EntitySummary[]> {
  const supabase = await createClient()
  
  let query = supabase
    .from('entities')
    .select('id, name, slug, entity_type, master_prompt, reference_images')
    .eq('project_id', projectId)
    .order('name', { ascending: true })
  
  if (entityType) {
    query = query.eq('entity_type', entityType)
  }
  
  const { data, error } = await query
  
  if (error) {
    console.error('Failed to fetch entities:', error)
    return []
  }
  
  return (data || []) as EntitySummary[]
}

/**
 * Get a single entity by ID
 */
export async function getEntityById(
  entityId: string
): Promise<EntitySummary | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('entities')
    .select('id, name, slug, entity_type, master_prompt, reference_images')
    .eq('id', entityId)
    .single()
  
  if (error) {
    if (error.code === 'PGRST116') return null // Not found
    console.error('Failed to fetch entity:', error)
    return null
  }
  
  return data as EntitySummary
}
