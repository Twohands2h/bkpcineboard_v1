'use server'

import { createClient } from '@/lib/supabase/server'

// ============================================
// SHOT FINAL VISUAL — Server Actions
// ============================================
// Sets/clears the editorial visual reference for a Shot.
// References a decision_note of type promote_asset.
// Application-level constraint: only promote_asset notes accepted.

/**
 * Set the Shot's Final Visual to a specific promoted asset selection.
 * Validates that the referenced decision_note is a promote_asset event.
 */
export async function setShotFinalVisualAction(params: {
    shotId: string
    selectionId: string
}): Promise<{ success: true } | { success: false; error: string }> {
    const { shotId, selectionId } = params

    if (!shotId) return { success: false, error: 'shotId missing' }
    if (!selectionId) return { success: false, error: 'selectionId missing' }

    const supabase = await createClient()

    // 1. Fetch and validate the decision_note
    const { data: note, error: noteError } = await supabase
        .from('decision_notes')
        .select('id, body')
        .eq('id', selectionId)
        .single()

    if (noteError || !note) {
        return { success: false, error: 'Decision note not found' }
    }

    // 2. Parse body and verify event type
    let parsed: any
    try {
        parsed = typeof note.body === 'string' ? JSON.parse(note.body) : note.body
    } catch {
        return { success: false, error: 'Decision note body is malformed' }
    }

    if (!parsed || parsed.event !== 'promote_asset') {
        return { success: false, error: `Decision note is not a promote_asset event (got: ${parsed?.event})` }
    }

    // 3. Update shot
    const { error: updateError } = await supabase
        .from('shots')
        .update({ final_visual_selection_id: selectionId })
        .eq('id', shotId)

    if (updateError) {
        return { success: false, error: `Failed to update shot: ${updateError.message}` }
    }

    return { success: true }
}

/**
 * Clear the Shot's Final Visual (set to null).
 */
export async function clearShotFinalVisualAction(params: {
    shotId: string
}): Promise<{ success: true } | { success: false; error: string }> {
    const { shotId } = params

    if (!shotId) return { success: false, error: 'shotId missing' }

    const supabase = await createClient()

    const { error } = await supabase
        .from('shots')
        .update({ final_visual_selection_id: null })
        .eq('id', shotId)

    if (error) {
        return { success: false, error: `Failed to clear final visual: ${error.message}` }
    }

    return { success: true }
}

/**
 * Get the Shot's Final Visual data (image snapshot from the decision_note).
 * Returns null if no final visual set or if note is missing.
 */
export async function getShotFinalVisualAction(params: {
    shotId: string
}): Promise<{
    selectionId: string
    src: string
    storagePath: string
    selectionNumber: number
    takeId: string | null
} | null> {
    const { shotId } = params

    if (!shotId) return null

    const supabase = await createClient()

    // 1. Get the shot's final_visual_selection_id
    const { data: shot } = await supabase
        .from('shots')
        .select('final_visual_selection_id')
        .eq('id', shotId)
        .single()

    if (!shot?.final_visual_selection_id) return null

    // 2. Fetch the decision_note
    const { data: note } = await supabase
        .from('decision_notes')
        .select('id, body')
        .eq('id', shot.final_visual_selection_id)
        .single()

    if (!note) return null

    // 3. Parse and extract image data
    let parsed: any
    try {
        parsed = typeof note.body === 'string' ? JSON.parse(note.body) : note.body
    } catch {
        return null
    }

    if (!parsed || parsed.event !== 'promote_asset') return null

    return {
        selectionId: note.id,
        src: parsed.image_snapshot?.src ?? '',
        storagePath: parsed.image_snapshot?.storage_path ?? '',
        selectionNumber: parsed.selection_number ?? 0,
        takeId: parsed.take_id ?? null,
    }
}