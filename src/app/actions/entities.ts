'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type {
  EntityContent,
  EntityType,
  Entity,
  EntityFreshData,
} from '@/app/actions/entity-types'

// Re-export types so existing importers of entities.ts don't break
export type {
  EntityContent,
  EntityType,
  Entity,
  EntityFreshData,
  MediaProvenance,
  MediaOriginLabel,
} from '@/app/actions/entity-types'

// Re-export MEDIA_ORIGIN_LABELS via a thin async wrapper is not possible in 'use server'.
// Import MEDIA_ORIGIN_LABELS directly from '@/app/actions/entity-types' in client components.

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

/** Fetch multiple entities by id in a single query, bypassing all caches.
 * Used by PLP at export click time to ensure ZIP reflects latest edits.
 *
 * Returns a Map<entityId, EntityFreshData>. Missing ids are absent (caller
 * falls back to node.data). On error returns empty Map — never throws.
 */
export async function getEntitiesByIdsAction(
  ids: string[],
): Promise<Map<string, EntityFreshData>> {
  const result = new Map<string, EntityFreshData>()
  if (ids.length === 0) return result

  const uniqueIds = [...new Set(ids)]

  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('entities')
      .select('id, name, entity_type, content')
      .in('id', uniqueIds)

    if (error) {
      console.error('[getEntitiesByIdsAction] query error:', error.message)
      return result
    }

    for (const row of data ?? []) {
      const c = (row.content as any) ?? {}

      const thumbnailPath: string | null = c.thumbnail_path ?? null

      const prompts: Array<{ id: string; title?: string; body: string }> =
        Array.isArray(c.prompts)
          ? c.prompts.filter((p: any) => typeof p.body === 'string')
          : []

      const notes: Array<{ id: string; body: string }> =
        Array.isArray(c.notes)
          ? c.notes.filter((n: any) => typeof n.body === 'string')
          : []

      // Collect origin_label from each media item (backward-compat: absent = 'Unknown')
      const mediaOriginLabels: string[] = Array.isArray(c.media)
        ? c.media.map((m: any) =>
          typeof m.provenance?.origin_label === 'string' && m.provenance.origin_label.trim()
            ? m.provenance.origin_label.trim()
            : 'Unknown'
        )
        : []

      result.set(row.id, {
        name: row.name ?? '',
        type: row.entity_type ?? '',
        thumbnailPath,
        content: {
          prompts,
          notes,
          mediaOriginLabels,
          provenance: {
            generated_with: typeof c.provenance?.generated_with === 'string' ? c.provenance.generated_with : '',
            tool_origin: typeof c.provenance?.tool_origin === 'string' ? c.provenance.tool_origin : '',
          },
        },
      })
    }
  } catch (err) {
    console.error('[getEntitiesByIdsAction] unexpected error:', err)
  }

  return result
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