import { createClient } from '@/lib/supabase/server'
import { Database } from '@/lib/db/schema'

type Shotlist = Database['public']['Tables']['shotlists']['Row']
type ShotlistInsert = Database['public']['Tables']['shotlists']['Insert']
type ShotlistUpdate = Database['public']['Tables']['shotlists']['Update']

// ============================================
// READ
// ============================================

/**
 * Get shotlist by project ID
 * MVP: one shotlist per project, returns single record or null
 */
export async function getShotlistByProject(projectId: string): Promise<Shotlist | null> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('shotlists')
        .select('*')
        .eq('project_id', projectId)
        .single()

    if (error && error.code !== 'PGRST116') {
        throw new Error(`Failed to fetch shotlist: ${error.message}`)
    }

    return data
}

/**
 * Get shotlist by ID
 */
export async function getShotlist(id: string): Promise<Shotlist | null> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('shotlists')
        .select('*')
        .eq('id', id)
        .single()

    if (error && error.code !== 'PGRST116') {
        throw new Error(`Failed to fetch shotlist: ${error.message}`)
    }

    return data
}

// ============================================
// CREATE
// ============================================

/**
 * Create shotlist for a project
 * MVP: enforces 1 shotlist per project at app level
 */
export async function createShotlist(
    projectId: string,
    data?: { title?: string; description?: string }
): Promise<Shotlist> {
    const supabase = await createClient()

    // Check if shotlist already exists (MVP constraint)
    const existing = await getShotlistByProject(projectId)
    if (existing) {
        throw new Error('Project already has a shotlist')
    }

    const insertData: ShotlistInsert = {
        project_id: projectId,
        title: data?.title ?? 'Main Shotlist',
        description: data?.description ?? null,
    }

    const { data: shotlist, error } = await supabase
        .from('shotlists')
        .insert(insertData)
        .select()
        .single()

    if (error) {
        throw new Error(`Failed to create shotlist: ${error.message}`)
    }

    return shotlist
}

// ============================================
// UPDATE
// ============================================

/**
 * Update shotlist metadata (title, description)
 */
export async function updateShotlist(
    id: string,
    data: { title?: string; description?: string }
): Promise<Shotlist> {
    const supabase = await createClient()

    const updateData: ShotlistUpdate = {}
    if (data.title !== undefined) updateData.title = data.title
    if (data.description !== undefined) updateData.description = data.description

    const { data: shotlist, error } = await supabase
        .from('shotlists')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

    if (error) {
        throw new Error(`Failed to update shotlist: ${error.message}`)
    }

    return shotlist
}

// ============================================
// DELETE
// ============================================

/**
 * Delete shotlist (cascades to shots)
 */
export async function deleteShotlist(id: string): Promise<void> {
    const supabase = await createClient()

    const { error } = await supabase
        .from('shotlists')
        .delete()
        .eq('id', id)

    if (error) {
        throw new Error(`Failed to delete shotlist: ${error.message}`)
    }
}

// ============================================
// HELPER: Get or Create
// ============================================

/**
 * Get existing shotlist or create default one
 * Useful for UI: ensures shotlist always exists when viewing project
 */
export async function getOrCreateShotlist(projectId: string): Promise<Shotlist> {
    const existing = await getShotlistByProject(projectId)
    if (existing) return existing

    return createShotlist(projectId)
}