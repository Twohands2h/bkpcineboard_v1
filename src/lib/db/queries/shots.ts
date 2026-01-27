import { createClient } from '@/lib/supabase/server'
import { Database } from '@/lib/db/schema'

type Shot = Database['public']['Tables']['shots']['Row']
type ShotInsert = Database['public']['Tables']['shots']['Insert']
type ShotUpdate = Database['public']['Tables']['shots']['Update']

// Type for entity references (JSONB structure)
export interface EntityReference {
    slug: string
    role?: string
    context_note?: string
}

export type ShotStatus = 'planning' | 'in_progress' | 'review' | 'done'

// ============================================
// READ
// ============================================

/**
 * Get all shots for a shotlist, ordered by order_index
 */
export async function getShotsByShotlist(shotlistId: string): Promise<Shot[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('shots')
        .select('*')
        .eq('shotlist_id', shotlistId)
        .order('order_index', { ascending: true })

    if (error) {
        throw new Error(`Failed to fetch shots: ${error.message}`)
    }

    return data ?? []
}

/**
 * Get single shot by ID
 */
export async function getShot(id: string): Promise<Shot | null> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('shots')
        .select('*')
        .eq('id', id)
        .single()

    if (error && error.code !== 'PGRST116') {
        throw new Error(`Failed to fetch shot: ${error.message}`)
    }

    return data
}

/**
 * Get shots by status
 */
export async function getShotsByStatus(
    shotlistId: string,
    status: ShotStatus
): Promise<Shot[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('shots')
        .select('*')
        .eq('shotlist_id', shotlistId)
        .eq('status', status)
        .order('order_index', { ascending: true })

    if (error) {
        throw new Error(`Failed to fetch shots by status: ${error.message}`)
    }

    return data ?? []
}

/**
 * Get shots containing a specific entity
 * Uses JSONB containment operator
 */
export async function getShotsByEntity(
    shotlistId: string,
    entitySlug: string
): Promise<Shot[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('shots')
        .select('*')
        .eq('shotlist_id', shotlistId)
        .filter('entity_references', 'cs', JSON.stringify([{ slug: entitySlug }]))
        .order('order_index', { ascending: true })

    if (error) {
        throw new Error(`Failed to fetch shots by entity: ${error.message}`)
    }

    return data ?? []
}

/**
 * Count shots in a shotlist
 */
export async function countShotsByShotlist(shotlistId: string): Promise<number> {
    const supabase = await createClient()

    const { count, error } = await supabase
        .from('shots')
        .select('*', { count: 'exact', head: true })
        .eq('shotlist_id', shotlistId)

    if (error) {
        throw new Error(`Failed to count shots: ${error.message}`)
    }

    return count ?? 0
}

/**
 * Get next order_index for new shot
 */
export async function getNextOrderIndex(shotlistId: string): Promise<number> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('shots')
        .select('order_index')
        .eq('shotlist_id', shotlistId)
        .order('order_index', { ascending: false })
        .limit(1)
        .single()

    if (error && error.code !== 'PGRST116') {
        throw new Error(`Failed to get next order index: ${error.message}`)
    }

    return data ? data.order_index + 1 : 0
}

// ============================================
// CREATE
// ============================================

/**
 * Create a new shot
 * Auto-assigns order_index if not provided
 */
export async function createShot(
    shotlistId: string,
    data: {
        shot_number: string
        title?: string
        description?: string
        shot_type?: string
        entity_references?: EntityReference[]
        status?: ShotStatus
        order_index?: number
    }
): Promise<Shot> {
    const supabase = await createClient()

    // Get next order_index if not provided
    const orderIndex = data.order_index ?? await getNextOrderIndex(shotlistId)

    const insertData: ShotInsert = {
        shotlist_id: shotlistId,
        shot_number: data.shot_number,
        title: data.title ?? null,
        description: data.description ?? null,
        shot_type: data.shot_type ?? null,
        entity_references: (data.entity_references ?? []) as unknown as Database['public']['Tables']['shots']['Insert']['entity_references'],
        status: data.status ?? 'planning',
        order_index: orderIndex,
    }

    const { data: shot, error } = await supabase
        .from('shots')
        .insert(insertData)
        .select()
        .single()

    if (error) {
        throw new Error(`Failed to create shot: ${error.message}`)
    }

    return shot
}

// ============================================
// UPDATE
// ============================================

/**
 * Update shot
 * Note: shotlist_id is immutable (shot belongs to one shotlist)
 */
export async function updateShot(
    id: string,
    data: {
        shot_number?: string
        title?: string
        description?: string
        shot_type?: string
        entity_references?: EntityReference[]
        status?: ShotStatus
        order_index?: number
    }
): Promise<Shot> {
    const supabase = await createClient()

    const updateData: ShotUpdate = {}
    if (data.shot_number !== undefined) updateData.shot_number = data.shot_number
    if (data.title !== undefined) updateData.title = data.title
    if (data.description !== undefined) updateData.description = data.description
    if (data.shot_type !== undefined) updateData.shot_type = data.shot_type
    if (data.entity_references !== undefined) {
        updateData.entity_references = data.entity_references as unknown as Database['public']['Tables']['shots']['Update']['entity_references']
    }
    if (data.status !== undefined) updateData.status = data.status
    if (data.order_index !== undefined) updateData.order_index = data.order_index

    const { data: shot, error } = await supabase
        .from('shots')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

    if (error) {
        throw new Error(`Failed to update shot: ${error.message}`)
    }

    return shot
}

/**
 * Reorder shots (batch update order_index)
 * Takes array of { id, order_index } pairs
 */
export async function reorderShots(
    updates: Array<{ id: string; order_index: number }>
): Promise<void> {
    const supabase = await createClient()

    // Supabase doesn't support batch update, so we do individual updates
    // TODO: Consider RPC function for atomic reorder if performance is an issue
    for (const update of updates) {
        const { error } = await supabase
            .from('shots')
            .update({ order_index: update.order_index })
            .eq('id', update.id)

        if (error) {
            throw new Error(`Failed to reorder shot ${update.id}: ${error.message}`)
        }
    }
}

// ============================================
// DELETE
// ============================================

/**
 * Delete shot
 */
export async function deleteShot(id: string): Promise<void> {
    const supabase = await createClient()

    const { error } = await supabase
        .from('shots')
        .delete()
        .eq('id', id)

    if (error) {
        throw new Error(`Failed to delete shot: ${error.message}`)
    }
}