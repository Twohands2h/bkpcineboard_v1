import { createClient } from '@/lib/supabase/server'
import type { Board } from '../queries/boards'

// ============================================
// MUTATION: createBoard
// ============================================

/**
 * Crea una board vuota in un progetto
 * 
 * @param projectId - UUID del progetto
 * @param title - Titolo della board (required, non vuoto)
 * @param description - Descrizione opzionale
 * @returns Board creata
 * @throws Error se projectId non esiste o title vuoto
 */
export async function createBoard(
  projectId: string,
  title: string,
  description?: string
): Promise<Board> {
  const supabase = await createClient()
  
  // Validazione title
  if (!title || title.trim() === '') {
    throw new Error('Board title cannot be empty')
  }
  
  // Verifica che project esista
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .single()
  
  if (projectError || !project) {
    throw new Error(`Project not found: ${projectId}`)
  }
  
  // Crea board
  const { data, error } = await supabase
    .from('boards')
    .insert({
      project_id: projectId,
      title: title.trim(),
      description: description?.trim() || null,
      status: 'active',
      canvas_state: {}
    })
    .select()
    .single()
  
  if (error) throw new Error(error.message)
  return data
}

// ============================================
// MUTATION: updateBoard
// ============================================

/**
 * Modifica title e/o description di una board
 * 
 * @param boardId - UUID della board
 * @param updates - Campi da aggiornare
 * @returns Board aggiornata
 * @throws Error se board non esiste, è archived, o title vuoto
 */
export async function updateBoard(
  boardId: string,
  updates: {
    title?: string
    description?: string | null
  }
): Promise<Board> {
  const supabase = await createClient()
  
  // Validazione: almeno un campo da aggiornare
  if (updates.title === undefined && updates.description === undefined) {
    throw new Error('No fields to update')
  }
  
  // Validazione title se passato
  if (updates.title !== undefined && updates.title.trim() === '') {
    throw new Error('Board title cannot be empty')
  }
  
  // Verifica che board esista e sia active
  const { data: existingBoard, error: checkError } = await supabase
    .from('boards')
    .select('id, status')
    .eq('id', boardId)
    .single()
  
  if (checkError || !existingBoard) {
    throw new Error(`Board not found: ${boardId}`)
  }
  
  if (existingBoard.status !== 'active') {
    throw new Error('Cannot update archived board')
  }
  
  // Prepara update payload
  const updatePayload: Record<string, unknown> = {}
  
  if (updates.title !== undefined) {
    updatePayload.title = updates.title.trim()
  }
  
  if (updates.description !== undefined) {
    updatePayload.description = updates.description?.trim() || null
  }
  
  // Esegui update
  const { data, error } = await supabase
    .from('boards')
    .update(updatePayload)
    .eq('id', boardId)
    .select()
    .single()
  
  if (error) throw new Error(error.message)
  return data
}

// ============================================
// MUTATION: archiveBoard (RPC Transazionale)
// ============================================

/**
 * Soft delete di una board (TRANSAZIONALE)
 * 
 * Usa RPC PostgreSQL per garantire atomicità:
 * 1. Verifica che board esista e sia active
 * 2. Verifica che board NON sia workspace attivo
 * 3. Termina tutti i board_links attivi
 * 4. Imposta board status = 'archived'
 * 
 * @param boardId - UUID della board
 * @returns Board archiviata
 * @throws Error se board non esiste, già archived, o è workspace attivo
 */
export async function archiveBoard(
  boardId: string
): Promise<Board> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .rpc('archive_board', { board_id: boardId })
  
  if (error) {
    // Converte errori PostgreSQL in messaggi semantici
    const message = error.message || 'Failed to archive board'
    throw new Error(message)
  }
  
  if (!data) {
    throw new Error(`Failed to archive board: ${boardId}`)
  }
  
  return data as Board
}
