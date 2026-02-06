import { createClient } from '@/lib/supabase/server'

// ============================================
// TYPES
// ============================================

export interface BoardLink {
  id: string
  board_id: string
  link_type: 'workspace' | 'source' | 'derived'
  target_type: 'entity' | 'shot'
  target_id: string
  status: 'active' | 'ended'
  created_at: string
}

// ============================================
// MUTATION: Set Board as Workspace
// ============================================

/**
 * Imposta una Board come workspace per un Entity o Shot
 * 
 * Regole:
 * - Una Board può essere workspace di UN solo target
 * - Un Entity/Shot può avere UNA sola Board workspace
 * - Se esiste già un workspace, viene sostituito (ended)
 */
export async function setBoardAsWorkspace(
  boardId: string,
  targetType: 'entity' | 'shot',
  targetId: string
): Promise<BoardLink> {
  const supabase = await createClient()

  // 1. End any existing workspace link for THIS board
  await supabase
    .from('board_links')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('board_id', boardId)
    .eq('link_type', 'workspace')
    .eq('status', 'active')

  // 2. End any existing workspace link for THIS target
  await supabase
    .from('board_links')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .eq('link_type', 'workspace')
    .eq('status', 'active')

  // 3. Create new workspace link
  const { data, error } = await supabase
    .from('board_links')
    .insert({
      board_id: boardId,
      link_type: 'workspace',
      target_type: targetType,
      target_id: targetId,
      status: 'active'
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to set workspace: ${error.message}`)
  }

  return data as BoardLink
}

// ============================================
// MUTATION: Unset Board Workspace
// ============================================

/**
 * Rimuove il workspace link di una Board
 * La Board torna "Free"
 */
export async function unsetBoardWorkspace(
  boardId: string
): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('board_links')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('board_id', boardId)
    .eq('link_type', 'workspace')
    .eq('status', 'active')

  if (error) {
    throw new Error(`Failed to unset workspace: ${error.message}`)
  }
}
