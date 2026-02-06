import { createClient } from '@/lib/supabase/server'
import type { Board } from './boards'

// ============================================
// TYPES
// ============================================

export interface BoardDerivation {
  id: string
  board_id: string
  source_board_id: string
  status: 'active' | 'ended'
  ended_at: string | null
  forked_at: string
  fork_note: string | null
  created_at: string
}

export interface BoardWithDerivation extends Board {
  derivation?: BoardDerivation
  source_board?: Board
}

// ============================================
// QUERIES
// ============================================

/**
 * Carica derivazione attiva di una board (se esiste)
 * "Questa board deriva da..."
 */
export async function getBoardDerivation(
  boardId: string
): Promise<BoardDerivation | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('board_derivations')
    .select('*')
    .eq('board_id', boardId)
    .eq('status', 'active')
    .single()
  
  if (error && error.code !== 'PGRST116') throw new Error(error.message)
  return data
}

/**
 * Carica board madre (source) di una derivazione
 * 
 * NOTA: Include board anche se archived, per tracciabilità storica.
 * Una board figlia deve poter vedere da dove deriva anche se
 * la madre è stata archiviata.
 */
export async function getParentBoard(
  boardId: string
): Promise<Board | null> {
  const supabase = await createClient()
  
  // Trova derivazione attiva
  const { data: derivation, error: derivError } = await supabase
    .from('board_derivations')
    .select('source_board_id')
    .eq('board_id', boardId)
    .eq('status', 'active')
    .single()
  
  if (derivError && derivError.code !== 'PGRST116') throw new Error(derivError.message)
  if (!derivation) return null
  
  // Carica board madre (inclusa archived per tracciabilità)
  const { data: board, error: boardError } = await supabase
    .from('boards')
    .select('*')
    .eq('id', derivation.source_board_id)
    .single()
  
  if (boardError && boardError.code !== 'PGRST116') throw new Error(boardError.message)
  return board
}

/**
 * Carica board madre SOLO se attiva
 * Per navigazione UI (non mostra archived)
 */
export async function getActiveParentBoard(
  boardId: string
): Promise<Board | null> {
  const supabase = await createClient()
  
  // Trova derivazione attiva
  const { data: derivation, error: derivError } = await supabase
    .from('board_derivations')
    .select('source_board_id')
    .eq('board_id', boardId)
    .eq('status', 'active')
    .single()
  
  if (derivError && derivError.code !== 'PGRST116') throw new Error(derivError.message)
  if (!derivation) return null
  
  // Carica board madre solo se active
  const { data: board, error: boardError } = await supabase
    .from('boards')
    .select('*')
    .eq('id', derivation.source_board_id)
    .eq('status', 'active')
    .single()
  
  if (boardError && boardError.code !== 'PGRST116') throw new Error(boardError.message)
  return board
}

/**
 * Carica boards figlie (derivate) da una board
 * "Quali boards sono state forkkate da questa?"
 * Solo boards attive
 */
export async function getChildBoards(
  sourceBoardId: string
): Promise<Board[]> {
  const supabase = await createClient()
  
  // Trova derivazioni attive
  const { data: derivations, error: derivError } = await supabase
    .from('board_derivations')
    .select('board_id')
    .eq('source_board_id', sourceBoardId)
    .eq('status', 'active')
  
  if (derivError) throw new Error(derivError.message)
  if (!derivations || derivations.length === 0) return []
  
  const boardIds = derivations.map(d => d.board_id)
  
  // Carica boards figlie (solo active)
  const { data: boards, error: boardsError } = await supabase
    .from('boards')
    .select('*')
    .in('id', boardIds)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
  
  if (boardsError) throw new Error(boardsError.message)
  return boards ?? []
}

/**
 * Carica tutte le boards figlie (incluse archived)
 * Per admin/history view
 */
export async function getChildBoardsAll(
  sourceBoardId: string
): Promise<Board[]> {
  const supabase = await createClient()
  
  // Trova tutte le derivazioni (incluse ended)
  const { data: derivations, error: derivError } = await supabase
    .from('board_derivations')
    .select('board_id')
    .eq('source_board_id', sourceBoardId)
  
  if (derivError) throw new Error(derivError.message)
  if (!derivations || derivations.length === 0) return []
  
  const boardIds = derivations.map(d => d.board_id)
  
  // Carica boards figlie (tutte)
  const { data: boards, error: boardsError } = await supabase
    .from('boards')
    .select('*')
    .in('id', boardIds)
    .order('created_at', { ascending: false })
  
  if (boardsError) throw new Error(boardsError.message)
  return boards ?? []
}

/**
 * Carica board con info derivazione completa
 * 
 * NOTA: source_board include archived per tracciabilità storica.
 * La UI può decidere come visualizzare una board archived.
 */
export async function getBoardWithDerivation(
  boardId: string
): Promise<BoardWithDerivation | null> {
  const supabase = await createClient()
  
  // Board base (deve essere active)
  const { data: board, error: boardError } = await supabase
    .from('boards')
    .select('*')
    .eq('id', boardId)
    .eq('status', 'active')
    .single()
  
  if (boardError && boardError.code !== 'PGRST116') throw new Error(boardError.message)
  if (!board) return null
  
  // Derivazione attiva
  const { data: derivation, error: derivError } = await supabase
    .from('board_derivations')
    .select('*')
    .eq('board_id', boardId)
    .eq('status', 'active')
    .single()
  
  if (derivError && derivError.code !== 'PGRST116') throw new Error(derivError.message)
  
  if (!derivation) {
    return { ...board, derivation: undefined, source_board: undefined }
  }
  
  // Board madre (inclusa archived per tracciabilità)
  const { data: sourceBoard, error: sourceError } = await supabase
    .from('boards')
    .select('*')
    .eq('id', derivation.source_board_id)
    .single()
  
  if (sourceError && sourceError.code !== 'PGRST116') throw new Error(sourceError.message)
  
  return {
    ...board,
    derivation,
    source_board: sourceBoard ?? undefined
  }
}

/**
 * Verifica se una board ha derivazioni attive
 */
export async function boardHasChildren(
  boardId: string
): Promise<boolean> {
  const supabase = await createClient()
  
  const { count, error } = await supabase
    .from('board_derivations')
    .select('*', { count: 'exact', head: true })
    .eq('source_board_id', boardId)
    .eq('status', 'active')
  
  if (error) throw new Error(error.message)
  return (count ?? 0) > 0
}

/**
 * Verifica se una board è derivata da un'altra
 */
export async function boardIsDerived(
  boardId: string
): Promise<boolean> {
  const supabase = await createClient()
  
  const { count, error } = await supabase
    .from('board_derivations')
    .select('*', { count: 'exact', head: true })
    .eq('board_id', boardId)
    .eq('status', 'active')
  
  if (error) throw new Error(error.message)
  return (count ?? 0) > 0
}

/**
 * Carica history derivazioni di una board (incluse ended)
 */
export async function loadDerivationHistory(
  boardId: string
): Promise<BoardDerivation[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('board_derivations')
    .select('*')
    .eq('board_id', boardId)
    .order('forked_at', { ascending: false })
  
  if (error) throw new Error(error.message)
  return data ?? []
}
