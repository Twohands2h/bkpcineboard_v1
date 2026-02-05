import { createClient } from '@/lib/supabase/server'
import type { BoardNode } from './board-nodes'

// ============================================
// TYPES
// ============================================

export type TakeStatus = 'draft' | 'candidate' | 'selected' | 'rejected'

export interface Take {
  id: string
  shot_id: string
  name: string
  description: string | null
  status: TakeStatus
  order_index: number
  created_at: string
  updated_at: string
}

export interface TakeItem {
  id: string
  take_id: string
  board_node_id: string
  order_index: number
  metadata: Record<string, unknown>
  created_at: string
}

export interface TakeItemWithNode extends TakeItem {
  board_node: BoardNode
}

export interface TakeWithItems extends Take {
  items: TakeItemWithNode[]
}

// ============================================
// QUERIES
// ============================================

/**
 * Lista takes di uno Shot
 * Ordinati per status priority (selected first) poi order_index
 */
export async function listShotTakes(
  shotId: string
): Promise<Take[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('takes')
    .select('*')
    .eq('shot_id', shotId)
    .order('order_index', { ascending: true })

  if (error) throw new Error(error.message)

  // Sort: selected first, poi candidate, poi draft, poi rejected
  const statusOrder: Record<TakeStatus, number> = {
    selected: 0,
    candidate: 1,
    draft: 2,
    rejected: 3
  }

  return (data ?? []).sort((a, b) => {
    const statusDiff = statusOrder[a.status as TakeStatus] - statusOrder[b.status as TakeStatus]
    if (statusDiff !== 0) return statusDiff
    return a.order_index - b.order_index
  })
}

/**
 * Carica il Take selected di uno Shot (se esiste)
 */
export async function getSelectedTake(
  shotId: string
): Promise<Take | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('takes')
    .select('*')
    .eq('shot_id', shotId)
    .eq('status', 'selected')
    .single()

  if (error && error.code !== 'PGRST116') throw new Error(error.message)
  return data
}

/**
 * Carica singolo Take per ID
 */
export async function getTake(
  takeId: string
): Promise<Take | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('takes')
    .select('*')
    .eq('id', takeId)
    .single()

  if (error && error.code !== 'PGRST116') throw new Error(error.message)
  return data
}

/**
 * Carica items di un Take
 */
export async function loadTakeItems(
  takeId: string
): Promise<TakeItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('take_items')
    .select('*')
    .eq('take_id', takeId)
    .order('order_index', { ascending: true })

  if (error) throw new Error(error.message)
  return data ?? []
}

/**
 * Carica items di un Take con board_nodes risolti
 * 
 * NOTA: Carica solo nodi che sono:
 * - status = 'active' (non rimossi)
 * - superseded_by IS NULL (versione corrente)
 * 
 * Items che puntano a nodi non più validi vengono filtrati
 */
export async function loadTakeItemsWithNodes(
  takeId: string
): Promise<TakeItemWithNode[]> {
  const supabase = await createClient()

  // Carica items
  const { data: items, error: itemsError } = await supabase
    .from('take_items')
    .select('*')
    .eq('take_id', takeId)
    .order('order_index', { ascending: true })

  if (itemsError) throw new Error(itemsError.message)
  if (!items || items.length === 0) return []

  // Carica board_nodes referenziati (solo attivi e correnti)
  const nodeIds = items.map(i => i.board_node_id)

  const { data: nodes, error: nodesError } = await supabase
    .from('board_nodes')
    .select('*')
    .in('id', nodeIds)
    .eq('status', 'active')
    .is('superseded_by', null)

  if (nodesError) throw new Error(nodesError.message)

  // Mappa per lookup veloce
  const nodeMap = new Map((nodes ?? []).map(n => [n.id, n]))

  // Combina, filtrando items con nodi non più validi
  return items
    .map(item => {
      const node = nodeMap.get(item.board_node_id)
      if (!node) return null  // Nodo rimosso o superseded
      return { ...item, board_node: node }
    })
    .filter((item): item is TakeItemWithNode => item !== null)
}

/**
 * Carica items con nodi (inclusi removed/superseded)
 * Per history view completa
 */
export async function loadTakeItemsWithNodesAll(
  takeId: string
): Promise<TakeItemWithNode[]> {
  const supabase = await createClient()

  // Carica items
  const { data: items, error: itemsError } = await supabase
    .from('take_items')
    .select('*')
    .eq('take_id', takeId)
    .order('order_index', { ascending: true })

  if (itemsError) throw new Error(itemsError.message)
  if (!items || items.length === 0) return []

  // Carica board_nodes referenziati (tutti, senza filtri)
  const nodeIds = items.map(i => i.board_node_id)

  const { data: nodes, error: nodesError } = await supabase
    .from('board_nodes')
    .select('*')
    .in('id', nodeIds)

  if (nodesError) throw new Error(nodesError.message)

  // Mappa per lookup
  const nodeMap = new Map((nodes ?? []).map(n => [n.id, n]))

  // Combina
  return items
    .map(item => {
      const node = nodeMap.get(item.board_node_id)
      if (!node) return null
      return { ...item, board_node: node }
    })
    .filter((item): item is TakeItemWithNode => item !== null)
}

/**
 * Carica Take completo con items e nodes
 */
export async function getTakeWithItems(
  takeId: string
): Promise<TakeWithItems | null> {
  const supabase = await createClient()

  // Take base
  const { data: take, error: takeError } = await supabase
    .from('takes')
    .select('*')
    .eq('id', takeId)
    .single()

  if (takeError && takeError.code !== 'PGRST116') throw new Error(takeError.message)
  if (!take) return null

  // Items con nodes (solo attivi e correnti)
  const items = await loadTakeItemsWithNodes(takeId)

  return { ...take, items }
}

/**
 * Conta takes per status di uno Shot
 */
export async function countShotTakesByStatus(
  shotId: string
): Promise<Record<TakeStatus, number>> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('takes')
    .select('status')
    .eq('shot_id', shotId)

  if (error) throw new Error(error.message)

  const counts: Record<TakeStatus, number> = {
    draft: 0,
    candidate: 0,
    selected: 0,
    rejected: 0
  }

  for (const take of data ?? []) {
    counts[take.status as TakeStatus]++
  }

  return counts
}

/**
 * Conta items validi di un Take
 * Solo nodi attivi e correnti
 */
export async function countValidTakeItems(
  takeId: string
): Promise<number> {
  const supabase = await createClient()

  // Prima ottieni gli item IDs
  const { data: items, error: itemsError } = await supabase
    .from('take_items')
    .select('board_node_id')
    .eq('take_id', takeId)

  if (itemsError) throw new Error(itemsError.message)
  if (!items || items.length === 0) return 0

  // Poi conta quanti nodi sono validi
  const nodeIds = items.map(i => i.board_node_id)

  const { count, error: countError } = await supabase
    .from('board_nodes')
    .select('*', { count: 'exact', head: true })
    .in('id', nodeIds)
    .eq('status', 'active')
    .is('superseded_by', null)

  if (countError) throw new Error(countError.message)
  return count ?? 0
}

/**
 * Lista takes candidate di uno Shot
 * Per review workflow
 */
export async function listCandidateTakes(
  shotId: string
): Promise<Take[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('takes')
    .select('*')
    .eq('shot_id', shotId)
    .eq('status', 'candidate')
    .order('order_index', { ascending: true })

  if (error) throw new Error(error.message)
  return data ?? []
}

// ============================================
// CREATE (R3.6)
// ============================================

/**
 * Crea un nuovo Take (atomico, senza logica)
 * R3.6: usata da restore per creare branch da snapshot
 * 
 * IMPORTANTE: Questa query è stupida e atomica.
 * Calcolo order_index e altre logiche vanno nella Server Action.
 */
export async function createTake(data: {
  shot_id: string
  name: string
  description: string | null
  status: TakeStatus
  order_index: number
}): Promise<Take> {
  const supabase = await createClient()

  const { data: take, error } = await supabase
    .from('takes')
    .insert({
      shot_id: data.shot_id,
      name: data.name,
      description: data.description,
      status: data.status,
      order_index: data.order_index,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create take: ${error.message}`)
  }

  return take as Take
}