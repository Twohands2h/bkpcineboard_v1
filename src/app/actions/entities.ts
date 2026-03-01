'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ── Types ──

export interface EntityContent {
  description?: string
  media?: Array<{
    storage_path: string
    bucket: string
    display_name: string
    mime_type?: string
    asset_type: 'image' | 'video'
  }>
  prompts?: Array<{
    body: string
    promptType?: string
    origin?: string
    title?: string
  }>
  notes?: Array<{ body: string }>
  provenance?: {
    generated_with?: string
    tool_origin?: string
    source_url?: string
  }
  thumbnail_path?: string
}

export type EntityType = 'character' | 'environment' | 'prop' | 'cinematography'

export interface Entity {
  id: string
  project_id: string
  name: string
  entity_type: EntityType
  content: EntityContent
  created_at: string
  updated_at: string
}

// ── Queries ──

export async function listEntitiesAction(projectId: string): Promise<Entity[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('entities')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[entities] list error:', error)
    return []
  }
  return (data ?? []) as Entity[]
}

export async function getEntityAction(entityId: string): Promise<Entity | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('entities')
    .select('*')
    .eq('id', entityId)
    .single()

  if (error) {
    console.error('[entities] get error:', error)
    return null
  }
  return data as Entity
}

// ── Mutations ──

export async function createEntityAction(params: {
  projectId: string
  name: string
  entityType: EntityType
  content?: EntityContent
}): Promise<Entity | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('entities')
    .insert({
      project_id: params.projectId,
      name: params.name,
      entity_type: params.entityType,
      content: params.content ?? {},
    })
    .select()
    .single()

  if (error) {
    console.error('[entities] create error:', error)
    return null
  }
  return data as Entity
}

export async function updateEntityAction(params: {
  entityId: string
  name?: string
  entityType?: EntityType
  content?: EntityContent
}): Promise<Entity | null> {
  const supabase = await createClient()
  const update: Record<string, unknown> = {}
  if (params.name !== undefined) update.name = params.name
  if (params.entityType !== undefined) update.entity_type = params.entityType
  if (params.content !== undefined) update.content = params.content

  const { data, error } = await supabase
    .from('entities')
    .update(update)
    .eq('id', params.entityId)
    .select()
    .single()

  if (error) {
    console.error('[entities] update error:', error)
    return null
  }
  return data as Entity
}

export async function deleteEntityAction(entityId: string): Promise<boolean> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('entities')
    .delete()
    .eq('id', entityId)

  if (error) {
    console.error('[entities] delete error:', error)
    return false
  }
  return true
}

// ── Crystallize: create entity from canvas selection ──

export async function crystallizeEntityAction(params: {
  projectId: string
  name: string
  entityType: EntityType
  content: EntityContent
}): Promise<Entity | null> {
  // Same as create, but semantically distinct for future tracking
  return createEntityAction(params)
}