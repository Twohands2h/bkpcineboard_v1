import { createClient } from '@/lib/supabase/server'

// ============================================
// MUTATION: updateCanvasState
// ============================================

/**
 * Persiste lo stato del viewport canvas
 * 
 * Persistenza tecnica, non UX:
 * - No history
 * - No undo
 * - Serve solo a "ricordare dove eri"
 * 
 * @param boardId - UUID della board
 * @param viewport - Stato viewport { x, y, zoom }
 */
export async function updateCanvasState(
  boardId: string,
  viewport: { x: number; y: number; zoom: number }
): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('boards')
    .update({
      canvas_state: { viewport }
    })
    .eq('id', boardId)
    .eq('status', 'active')

  if (error) {
    // Log but don't throw - viewport save is non-critical
    console.error('Failed to save canvas state:', error.message)
  }
}
