import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/db/schema'

// ============================================
// TYPES (DERIVED FROM SUPABASE SCHEMA)
// ============================================

type EntityRow = Database['public']['Tables']['entities']['Row']
type EntityInsert = Database['public']['Tables']['entities']['Insert']
type EntityUpdate = Database['public']['Tables']['entities']['Update']
type EntityType = 'character' | 'environment' | 'asset'

// ============================================
// UTILITY: Slug Generation
// ============================================

/**
 * Generate slug from name
 * - Lowercase
 * - Replace spaces with hyphens
 * - Remove special characters
 * - Trim hyphens
 * 
 * IMPORTANT: Called ONLY on create, NOT on update
 */
export function generateSlug(name: string): string {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '') // Remove special chars
        .replace(/\s+/g, '-')     // Spaces to hyphens
        .replace(/-+/g, '-')      // Multiple hyphens to single
        .replace(/^-|-$/g, '')    // Trim hyphens
}

// ============================================
// QUERIES
// ============================================

/**
 * Get all entities for a project
 * Ordered by type, then name
 */
export async function getEntitiesByProject(
    projectId: string
): Promise<EntityRow[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('entities')
        .select('*')
        .eq('project_id', projectId)
        .order('type', { ascending: true })
        .order('name', { ascending: true })

    if (error) {
        console.error('Error fetching entities:', error)
        throw new Error('Failed to fetch entities')
    }

    return data ?? []
}

/**
 * Get entities by type for a project
 */
export async function getEntitiesByType(
    projectId: string,
    type: EntityType
): Promise<EntityRow[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('entities')
        .select('*')
        .eq('project_id', projectId)
        .eq('type', type)
        .order('name', { ascending: true })

    if (error) {
        console.error('Error fetching entities by type:', error)
        throw new Error('Failed to fetch entities')
    }

    return data ?? []
}

/**
 * Get single entity by ID
 */
export async function getEntity(id: string): Promise<EntityRow | null> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('entities')
        .select('*')
        .eq('id', id)
        .single()

    if (error) {
        if (error.code === 'PGRST116') {
            return null // Not found
        }
        console.error('Error fetching entity:', error)
        throw new Error('Failed to fetch entity')
    }

    return data
}

/**
 * Count entities in a project
 * Used to enforce max 5 limit in Server Action
 */
export async function countEntitiesByProject(
    projectId: string
): Promise<number> {
    const supabase = await createClient()

    const { count, error } = await supabase
        .from('entities')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId)

    if (error) {
        console.error('Error counting entities:', error)
        throw new Error('Failed to count entities')
    }

    return count ?? 0
}

/**
 * Create new entity
 * - Generates slug from name (create-only)
 * - Does NOT check max 5 limit (handled in Server Action)
 */
export async function createEntity(
    input: Omit<EntityInsert, 'slug'>
): Promise<EntityRow> {
    const supabase = await createClient()

    // Generate slug from name (immutable after creation)
    const slug = generateSlug(input.name)

    const { data, error } = await supabase
        .from('entities')
        .insert({
            ...input,
            slug,
        })
        .select()
        .single()

    if (error) {
        console.error('Error creating entity:', error)

        // Handle unique constraint violation (duplicate slug)
        if (error.code === '23505') {
            throw new Error('An entity with a similar name already exists in this project')
        }

        throw new Error('Failed to create entity')
    }

    return data
}

/**
 * Update entity
 * - Slug is NOT regenerated (immutable for @reference stability)
 * - Only updates provided fields
 */
export async function updateEntity(
    id: string,
    input: EntityUpdate
): Promise<EntityRow> {
    const supabase = await createClient()

    // Explicitly exclude slug from updates (immutable)
    const { slug: _, ...updateData } = input as any

    const { data, error } = await supabase
        .from('entities')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

    if (error) {
        console.error('Error updating entity:', error)
        throw new Error('Failed to update entity')
    }

    return data
}

/**
 * Delete entity
 */
export async function deleteEntity(id: string): Promise<void> {
    const supabase = await createClient()

    const { error } = await supabase
        .from('entities')
        .delete()
        .eq('id', id)

    if (error) {
        console.error('Error deleting entity:', error)
        throw new Error('Failed to delete entity')
    }
}