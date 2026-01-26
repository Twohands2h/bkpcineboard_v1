import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/db/schema'

// ============================================
// TYPES (DERIVED FROM SUPABASE SCHEMA)
// ============================================

type ProjectRow = Database['public']['Tables']['projects']['Row']
type ProjectInsert = Database['public']['Tables']['projects']['Insert']
type ProjectUpdate = Database['public']['Tables']['projects']['Update']

// ============================================
// QUERIES
// ============================================

/**
 * Get all projects
 * TODO: Add pagination when project count grows
 */
export async function getProjects(): Promise<ProjectRow[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching projects:', error)
        throw new Error('Failed to fetch projects')
    }

    return data ?? []
}

/**
 * Get single project by ID
 */
export async function getProject(id: string): Promise<ProjectRow | null> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', id)
        .single()

    if (error) {
        if (error.code === 'PGRST116') {
            // Not found
            return null
        }
        console.error('Error fetching project:', error)
        throw new Error('Failed to fetch project')
    }

    return data
}

/**
 * Create new project
 */
export async function createProject(
    input: ProjectInsert
): Promise<ProjectRow> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('projects')
        .insert(input)
        .select()
        .single()

    if (error) {
        console.error('Error creating project:', error)
        throw new Error('Failed to create project')
    }

    return data
}

/**
 * Update existing project
 */
export async function updateProject(
    id: string,
    input: ProjectUpdate
): Promise<ProjectRow> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('projects')
        .update(input)
        .eq('id', id)
        .select()
        .single()

    if (error) {
        console.error('Error updating project:', error)
        throw new Error('Failed to update project')
    }

    return data
}

/**
 * Delete project
 */
export async function deleteProject(id: string): Promise<void> {
    const supabase = await createClient()

    const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', id)

    if (error) {
        console.error('Error deleting project:', error)
        throw new Error('Failed to delete project')
    }
}