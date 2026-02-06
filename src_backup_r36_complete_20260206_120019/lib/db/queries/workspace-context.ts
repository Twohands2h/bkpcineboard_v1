import { createClient } from '@/lib/supabase/server'

// ============================================
// TYPES
// ============================================

export interface WorkspaceTarget {
  type: 'entity' | 'shot'
  id: string
  name: string
  // Entity-specific
  entityType?: 'character' | 'environment' | 'asset'
  masterPrompt?: string | null
  referenceImages?: string[] | null
  // Shot-specific
  shotNumber?: string
  description?: string | null
}

// ============================================
// QUERY
// ============================================

/**
 * Get the workspace target (Entity or Shot) for a Board
 * Returns null if Board is not a workspace
 */
export async function getWorkspaceTarget(boardId: string): Promise<WorkspaceTarget | null> {
  const supabase = await createClient()
  
  // Find active workspace link for this board
  const { data: link, error: linkError } = await supabase
    .from('board_links')
    .select('target_type, target_id')
    .eq('board_id', boardId)
    .eq('link_type', 'workspace')
    .eq('status', 'active')
    .single()
  
  // No workspace link found (PGRST116 = not found, not an error)
  if (linkError && linkError.code !== 'PGRST116') {
    console.error('Error fetching workspace link:', linkError)
  }
  if (!link) return null
  
  // Fetch Entity details
  if (link.target_type === 'entity') {
    const { data: entity, error: entityError } = await supabase
      .from('entities')
      .select('id, name, type, master_prompt, reference_images')
      .eq('id', link.target_id)
      .single()
    
    if (entityError && entityError.code !== 'PGRST116') {
      console.error('Error fetching entity:', entityError)
    }
    if (!entity) return null
    
    return {
      type: 'entity',
      id: entity.id,
      name: entity.name,
      entityType: entity.type as 'character' | 'environment' | 'asset',
      masterPrompt: entity.master_prompt,
      referenceImages: entity.reference_images as string[] | null
    }
  }
  
  // Fetch Shot details
  if (link.target_type === 'shot') {
    const { data: shot, error: shotError } = await supabase
      .from('shots')
      .select('id, title, shot_number, description')
      .eq('id', link.target_id)
      .single()
    
    if (shotError && shotError.code !== 'PGRST116') {
      console.error('Error fetching shot:', shotError)
    }
    if (!shot) return null
    
    return {
      type: 'shot',
      id: shot.id,
      name: shot.title || `Shot ${shot.shot_number}`,
      shotNumber: shot.shot_number,
      description: shot.description
    }
  }
  
  return null
}
