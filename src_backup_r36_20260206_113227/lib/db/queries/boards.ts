import { createClient } from '@/lib/supabase/server'

// ============================================
// TYPES
// ============================================

export interface Board {
  id: string
  project_id: string
  title: string
  description: string | null
  status: 'active' | 'archived'
  template_id: string | null
  canvas_state: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface BoardWithMeta extends Board {
  node_count: number
  link_count: number
}

export interface BoardNode {
  id: string
  board_id: string
  node_type: string
  position_x: number
  position_y: number
  width: number | null
  height: number | null
  content: Record<string, unknown>
  status: string
}

// ============================================
// QUERIES
// ============================================

/**
 * Lista boards attive di un progetto
 * Ordinate per updated_at DESC (più recenti prima)
 */
export async function listProjectBoards(
  projectId: string
): Promise<Board[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('boards')
    .select('*')
    .eq('project_id', projectId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
  
  if (error) throw new Error(error.message)
  return data ?? []
}

/**
 * Lista TUTTE le boards di un progetto (incluse archived)
 * Per UI admin/history
 */
export async function listProjectBoardsAll(
  projectId: string
): Promise<Board[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('boards')
    .select('*')
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false })
  
  if (error) throw new Error(error.message)
  return data ?? []
}

/**
 * Carica singola board per ID
 * Ritorna null se non trovata o archived
 */
export async function getBoard(
  boardId: string
): Promise<Board | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('boards')
    .select('*')
    .eq('id', boardId)
    .eq('status', 'active')
    .single()
  
  if (error && error.code !== 'PGRST116') throw new Error(error.message)
  return data
}

/**
 * Carica singola board per ID (inclusa archived)
 * Per navigazione storica e tracciabilità
 */
export async function getBoardIncludingArchived(
  boardId: string
): Promise<Board | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('boards')
    .select('*')
    .eq('id', boardId)
    .single()
  
  if (error && error.code !== 'PGRST116') throw new Error(error.message)
  return data
}

/**
 * Carica board con conteggi meta
 * Utile per card preview in lista
 */
export async function getBoardWithMeta(
  boardId: string
): Promise<BoardWithMeta | null> {
  const supabase = await createClient()
  
  // Board base
  const { data: board, error: boardError } = await supabase
    .from('boards')
    .select('*')
    .eq('id', boardId)
    .eq('status', 'active')
    .single()
  
  if (boardError && boardError.code !== 'PGRST116') throw new Error(boardError.message)
  if (!board) return null
  
  // Count nodi attivi correnti
  const { count: nodeCount, error: nodeError } = await supabase
    .from('board_nodes')
    .select('*', { count: 'exact', head: true })
    .eq('board_id', boardId)
    .eq('status', 'active')
    .is('superseded_by', null)
  
  if (nodeError) throw new Error(nodeError.message)
  
  // Count links attivi
  const { count: linkCount, error: linkError } = await supabase
    .from('board_links')
    .select('*', { count: 'exact', head: true })
    .eq('board_id', boardId)
    .eq('status', 'active')
  
  if (linkError) throw new Error(linkError.message)
  
  return {
    ...board,
    node_count: nodeCount ?? 0,
    link_count: linkCount ?? 0
  }
}

/**
 * Carica tutti i nodi attivi di una board
 * Per nodi entity_ref, arricchisce con isArchived se l'entity è archiviata
 */
export async function getBoardNodes(
  boardId: string
): Promise<BoardNode[]> {
  const supabase = await createClient()
  
  const { data: nodes, error } = await supabase
    .from('board_nodes')
    .select('id, board_id, node_type, position_x, position_y, width, height, content, status')
    .eq('board_id', boardId)
    .eq('status', 'active')
  
  if (error) throw new Error(error.message)
  if (!nodes || nodes.length === 0) return []
  
  // Trova nodi entity_ref e estrai entity IDs
  const entityRefNodes = nodes.filter(n => {
    const content = n.content as Record<string, unknown>
    return content?.variant === 'entity' && content?.ref_id
  })
  
  if (entityRefNodes.length === 0) return nodes
  
  const entityIds = entityRefNodes.map(n => {
    const content = n.content as Record<string, unknown>
    return content.ref_id as string
  })
  
  // Carica status delle entity (incluse archiviate)
  const { data: entities, error: entitiesError } = await supabase
    .from('entities')
    .select('id, status')
    .in('id', entityIds)
  
  if (entitiesError) {
    console.error('Failed to fetch entity status:', entitiesError)
    return nodes // Ritorna nodi senza arricchimento in caso di errore
  }
  
  // Mappa per lookup veloce
  const entityStatusMap = new Map(entities?.map(e => [e.id, e.status]) ?? [])
  
  // Arricchisci nodi entity_ref con isArchived
  return nodes.map(node => {
    const content = node.content as Record<string, unknown>
    if (content?.variant === 'entity' && content?.ref_id) {
      const entityStatus = entityStatusMap.get(content.ref_id as string)
      // Se entity non trovata o archiviata, segna come archived
      const isArchived = !entityStatus || entityStatus === 'archived'
      return {
        ...node,
        content: {
          ...content,
          isArchived
        }
      }
    }
    return node
  })
}
