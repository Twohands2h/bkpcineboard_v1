import { createClient } from '@/lib/supabase/server'

// ============================================
// TYPES
// ============================================

export type BoardNodeType = 
  | 'image' 
  | 'video' 
  | 'prompt' 
  | 'note' 
  | 'heading' 
  | 'group' 
  | 'link' 
  | 'file' 
  | 'entity_ref'

export interface BoardNode {
  id: string
  board_id: string
  node_type: BoardNodeType
  position_x: number
  position_y: number
  width: number | null
  height: number | null
  content: Record<string, unknown>
  parent_id: string | null
  order_index: number
  status: 'active' | 'removed'
  version: number
  superseded_by: string | null
  previous_version: string | null
  content_updated_at: string
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface EntityRefContent {
  entity_id: string
  display_mode?: 'compact' | 'expanded' | 'minimal'
  local_note?: string
}

export interface BoardNodeWithEntity extends BoardNode {
  entity?: {
    id: string
    name: string
    slug: string
    type: 'character' | 'environment' | 'asset'
  }
}

// ============================================
// QUERIES
// ============================================

/**
 * Carica nodi correnti di una board
 * - Solo status = active
 * - Solo superseded_by IS NULL (versione corrente)
 * - Ordinati per order_index
 */
export async function loadBoardNodes(
  boardId: string
): Promise<BoardNode[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('board_nodes')
    .select('*')
    .eq('board_id', boardId)
    .eq('status', 'active')
    .is('superseded_by', null)
    .order('order_index', { ascending: true })
  
  if (error) throw new Error(error.message)
  return data ?? []
}

/**
 * Carica nodi correnti con dati Entity risolti
 * Per entity_ref, arricchisce con info Entity base
 */
export async function loadBoardNodesWithEntities(
  boardId: string
): Promise<BoardNodeWithEntity[]> {
  const supabase = await createClient()
  
  // Prima carica tutti i nodi correnti
  const { data: nodes, error: nodesError } = await supabase
    .from('board_nodes')
    .select('*')
    .eq('board_id', boardId)
    .eq('status', 'active')
    .is('superseded_by', null)
    .order('order_index', { ascending: true })
  
  if (nodesError) throw new Error(nodesError.message)
  if (!nodes || nodes.length === 0) return []
  
  // Estrai entity_id da nodi entity_ref
  const entityIds = nodes
    .filter(n => n.node_type === 'entity_ref')
    .map(n => (n.content as EntityRefContent).entity_id)
    .filter(Boolean)
  
  if (entityIds.length === 0) {
    return nodes.map(n => ({ ...n, entity: undefined }))
  }
  
  // Carica entities referenziate
  const { data: entities, error: entitiesError } = await supabase
    .from('entities')
    .select('id, name, slug, type')
    .in('id', entityIds)
  
  if (entitiesError) throw new Error(entitiesError.message)
  
  // Mappa per lookup veloce
  const entityMap = new Map(entities?.map(e => [e.id, e]) ?? [])
  
  // Arricchisci nodi
  return nodes.map(node => {
    if (node.node_type === 'entity_ref') {
      const content = node.content as EntityRefContent
      return {
        ...node,
        entity: entityMap.get(content.entity_id)
      }
    }
    return { ...node, entity: undefined }
  })
}

/**
 * Carica nodi figli di un gruppo
 * Per rendering gerarchico
 */
export async function loadGroupChildren(
  parentId: string
): Promise<BoardNode[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('board_nodes')
    .select('*')
    .eq('parent_id', parentId)
    .eq('status', 'active')
    .is('superseded_by', null)
    .order('order_index', { ascending: true })
  
  if (error) throw new Error(error.message)
  return data ?? []
}

/**
 * Carica singolo nodo per ID
 * Solo se corrente (non superseded) e attivo
 * 
 * NOTA: Filtro superseded_by IS NULL per garantire
 * che si carichi sempre la versione corrente
 */
export async function getBoardNode(
  nodeId: string
): Promise<BoardNode | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('board_nodes')
    .select('*')
    .eq('id', nodeId)
    .eq('status', 'active')
    .is('superseded_by', null)
    .single()
  
  if (error && error.code !== 'PGRST116') throw new Error(error.message)
  return data
}

/**
 * Carica singolo nodo per ID (qualsiasi versione)
 * Per navigazione history
 */
export async function getBoardNodeAnyVersion(
  nodeId: string
): Promise<BoardNode | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('board_nodes')
    .select('*')
    .eq('id', nodeId)
    .single()
  
  if (error && error.code !== 'PGRST116') throw new Error(error.message)
  return data
}

/**
 * Carica history versioni di un nodo
 * Segue catena previous_version
 */
export async function loadNodeVersionHistory(
  nodeId: string
): Promise<BoardNode[]> {
  const supabase = await createClient()
  
  // Trova nodo specificato
  const { data: startNode, error: startError } = await supabase
    .from('board_nodes')
    .select('*')
    .eq('id', nodeId)
    .single()
  
  if (startError) throw new Error(startError.message)
  if (!startNode) return []
  
  const history: BoardNode[] = [startNode]
  let currentNode = startNode
  
  // Segui catena previous_version (max 50 per safety)
  let iterations = 0
  while (currentNode.previous_version && iterations < 50) {
    const { data: prevNode, error: prevError } = await supabase
      .from('board_nodes')
      .select('*')
      .eq('id', currentNode.previous_version)
      .single()
    
    if (prevError || !prevNode) break
    
    history.push(prevNode)
    currentNode = prevNode
    iterations++
  }
  
  return history
}

/**
 * Conta nodi correnti per tipo in una board
 * Utile per statistiche
 */
export async function countBoardNodesByType(
  boardId: string
): Promise<Record<BoardNodeType, number>> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('board_nodes')
    .select('node_type')
    .eq('board_id', boardId)
    .eq('status', 'active')
    .is('superseded_by', null)
  
  if (error) throw new Error(error.message)
  
  const counts: Record<BoardNodeType, number> = {
    image: 0,
    video: 0,
    prompt: 0,
    note: 0,
    heading: 0,
    group: 0,
    link: 0,
    file: 0,
    entity_ref: 0
  }
  
  for (const node of data ?? []) {
    counts[node.node_type as BoardNodeType]++
  }
  
  return counts
}
