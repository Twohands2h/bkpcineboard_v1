import { createClient } from '@/lib/supabase/server'
import { Database } from '@/lib/db/schema'

type Take = Database['public']['Tables']['takes']['Row']
type TakeInsert = Database['public']['Tables']['takes']['Insert']
type TakeUpdate = Database['public']['Tables']['takes']['Update']

// ============================================
// READ
// ============================================

/**
 * Get single take by ID
 */
export async function getTake(id: string): Promise<Take | null> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('takes')
        .select('*')
        .eq('id', id)
        .single()

    if (error && error.code !== 'PGRST116') {
        throw new Error(`Failed to fetch take: ${error.message}`)
    }

    return data
}

/**
 * List all takes for a shot
 * Ordinati per created_at ASC (cronologico)
 */
export async function listShotTakes(shotId: string): Promise<Take[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('takes')
        .select('*')
        .eq('shot_id', shotId)
        .order('created_at', { ascending: true })

    if (error) {
        throw new Error(`Failed to list takes: ${error.message}`)
    }

    return data ?? []
}

/**
 * List all takes for a project
 */
export async function listProjectTakes(projectId: string): Promise<Take[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('takes')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })

    if (error) {
        throw new Error(`Failed to list takes: ${error.message}`)
    }

    return data ?? []
}

// ============================================
// CREATE
// ============================================

/**
 * Create a new take
 */
export async function createTake(
    projectId: string,
    shotId: string,
    data: {
        media_type?: string
        source?: string
        prompt_snapshot?: string
        status?: string
    }
): Promise<Take> {
    const supabase = await createClient()

    const insertData: TakeInsert = {
        project_id: projectId,
        shot_id: shotId,
        media_type: data.media_type ?? 'canvas',
        source: data.source ?? null,
        prompt_snapshot: data.prompt_snapshot ?? null,
        status: data.status ?? 'draft',
    }

    const { data: take, error } = await supabase
        .from('takes')
        .insert(insertData)
        .select()
        .single()

    if (error) {
        throw new Error(`Failed to create take: ${error.message}`)
    }

    return take
}

// ============================================
// UPDATE
// ============================================

/**
 * Update take
 */
export async function updateTake(
    id: string,
    data: {
        media_type?: string
        source?: string
        prompt_snapshot?: string
        status?: string
    }
): Promise<Take> {
    const supabase = await createClient()

    const updateData: TakeUpdate = {}
    if (data.media_type !== undefined) updateData.media_type = data.media_type
    if (data.source !== undefined) updateData.source = data.source
    if (data.prompt_snapshot !== undefined) updateData.prompt_snapshot = data.prompt_snapshot
    if (data.status !== undefined) updateData.status = data.status

    const { data: take, error } = await supabase
        .from('takes')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

    if (error) {
        throw new Error(`Failed to update take: ${error.message}`)
    }

    return take
}

// ============================================
// DELETE
// ============================================

/**
 * Delete take
 */
export async function deleteTake(id: string): Promise<void> {
    const supabase = await createClient()

    const { error } = await supabase
        .from('takes')
        .delete()
        .eq('id', id)

    if (error) {
        throw new Error(`Failed to delete take: ${error.message}`)
    }
}
