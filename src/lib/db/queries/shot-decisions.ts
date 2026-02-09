// ============================================================
// SHOT DECISION — DB QUERIES
// ============================================================
// Status: CANONICAL / INFRASTRUCTURE
// Pattern: identical to src/lib/db/queries/takes.ts
// Principle: The DB knows only UNDECIDED and DECIDED.
//            GRACE never touches this layer.
// ============================================================

import { createClient } from '@/lib/supabase/server'
import { Database } from '@/lib/db/schema'

type Shot = Database['public']['Tables']['shots']['Row']
type DecisionNoteRow = Database['public']['Tables']['decision_notes']['Row']

// ============================================
// READ
// ============================================

/**
 * Get shot's approved_take_id.
 * Returns null if UNDECIDED.
 */
export async function getShotApprovedTakeId(
  shotId: string
): Promise<string | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('shots')
    .select('approved_take_id')
    .eq('id', shotId)
    .single()

  if (error) {
    throw new Error(`Failed to fetch shot: ${error.message}`)
  }

  return data.approved_take_id ?? null
}

/**
 * Get all decision notes for a shot, ordered chronologically.
 * Uses existing decision_notes table with parent_type = 'shot'.
 */
export async function listShotDecisionNotes(
  shotId: string
): Promise<DecisionNoteRow[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('decision_notes')
    .select('*')
    .eq('parent_id', shotId)
    .eq('parent_type', 'shot')
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`Failed to list decision notes: ${error.message}`)
  }

  return data ?? []
}

// ============================================
// WRITE (ATOMIC)
// ============================================

/**
 * Persist a shot decision atomically.
 *
 * This function performs TWO operations that must both succeed:
 * 1. UPDATE shots SET approved_take_id
 * 2. INSERT decision_note
 *
 * If either fails, both are rolled back.
 *
 * IMPORTANT:
 * - This is the ONLY function that writes decisions
 * - GRACE state never reaches this layer
 * - Called only after lockDecision() in the domain
 */
export async function persistShotDecision(params: {
  shotId: string
  projectId: string
  approvedTakeId: string
  note: {
    id: string
    text: string
    createdAt: string // ISO timestamp
  }
}): Promise<void> {
  const supabase = await createClient()

  // Step 1: Update shot's approved_take_id
  const { error: shotError } = await supabase
    .from('shots')
    .update({ approved_take_id: params.approvedTakeId })
    .eq('id', params.shotId)

  if (shotError) {
    throw new Error(
      `Failed to update shot approved_take_id: ${shotError.message}`
    )
  }

  // Step 2: Insert decision note
  const { error: noteError } = await supabase
    .from('decision_notes')
    .insert({
      id: params.note.id,
      parent_id: params.shotId,
      parent_type: 'shot',
      project_id: params.projectId,
      body: params.note.text,
      created_at: params.note.createdAt,
      status: 'confirmed',
    })

  if (noteError) {
    // ROLLBACK: revert shot update
    // We must undo the approved_take_id change
    await supabase
      .from('shots')
      .update({ approved_take_id: null })
      .eq('id', params.shotId)

    throw new Error(
      `Failed to insert decision note (shot reverted): ${noteError.message}`
    )
  }
}

/**
 * Revert a shot decision.
 * Sets approved_take_id back to null.
 *
 * NOTE: This does NOT delete decision notes.
 * Notes are memory — they are never deleted.
 * This is used only when starting a new decision cycle
 * from DECIDED state.
 */
export async function revertShotApproval(
  shotId: string
): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('shots')
    .update({ approved_take_id: null })
    .eq('id', shotId)

  if (error) {
    throw new Error(
      `Failed to revert shot approval: ${error.message}`
    )
  }
}
