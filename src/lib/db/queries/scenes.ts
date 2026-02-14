import { createClient } from '@/lib/supabase/server'

// ============================================
// SCENES — Queries
// ============================================

export interface Scene {
    id: string
    project_id: string
    title: string
    description: string | null
    order_index: number
    created_at: string
    updated_at: string
}

/**
 * List all scenes for a project, ordered by order_index
 */
export async function listProjectScenes(projectId: string): Promise<Scene[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('scenes')
        .select('*')
        .eq('project_id', projectId)
        .order('order_index', { ascending: true })

    if (error) return []
    return data as Scene[]
}