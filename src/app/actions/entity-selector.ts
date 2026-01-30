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
// ACTIONS
// ============================================

/**
 * Get entities for selector dialog
 * Optionally filtered by type
 */
export async function getEntitiesForSelectorAction(
  projectId: string,
  entityType?: EntityType
): Promise<EntitySummary[]> {
  const supabase = await createClient()
  
  let query = supabase
    .from('entities')
    .select('id, name, slug, type, master_prompt, reference_images')
    .eq('project_id', projectId)
    .order('name', { ascending: true })
  
  if (entityType) {
    query = query.eq('type', entityType)  // CORRECT: 'type' not 'entity_type'
  }
  
  const { data, error } = await query
  
  if (error) {
    console.error('Failed to fetch entities:', error)
    return []
  }
  
  // Map 'type' to 'entity_type' for interface consistency
  return (data || []).map(entity => ({
    id: entity.id,
    name: entity.name,
    slug: entity.slug,
    entity_type: entity.type as EntityType,
    master_prompt: entity.master_prompt,
    reference_images: entity.reference_images as string[] | null,
  }))
}

/**
 * Get single entity for inspector
 */
export async function getEntityForInspectorAction(
  entityId: string
): Promise<EntitySummary | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('entities')
    .select('id, name, slug, type, master_prompt, reference_images')
    .eq('id', entityId)
    .single()
  
  if (error || !data) {
    console.error('Failed to fetch entity:', error)
    return null
  }
  
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    entity_type: data.type as EntityType,
    master_prompt: data.master_prompt,
    reference_images: data.reference_images as string[] | null,
  }
}
