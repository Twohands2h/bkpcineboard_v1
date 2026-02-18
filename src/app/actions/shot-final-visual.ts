'use server'

import { createClient } from '@/lib/supabase/server'

// ============================================
// SHOT FINAL VISUAL — Server Actions (v2)
// ============================================
// NodeId-based FV. No asset/selection/decision_notes dependency.
// Source of truth: shots.final_visual_node_id + shots.final_visual_take_id
// UI resolves src/storagePath from the node in the take snapshot.

/**
 * Set the Shot's Final Visual to a specific image node in a take.
 */
export async function setShotFinalVisualAction(params: {
    shotId: string
    nodeId: string
    takeId: string
}): Promise<{ success: true } | { success: false; error: string }> {
    const { shotId, nodeId, takeId } = params

    if (!shotId) return { success: false, error: 'shotId missing' }
    if (!nodeId) return { success: false, error: 'nodeId missing' }
    if (!takeId) return { success: false, error: 'takeId missing' }

    const supabase = await createClient()

    const { error } = await supabase
        .from('shots')
        .update({
            final_visual_node_id: nodeId,
            final_visual_take_id: takeId,
        })
        .eq('id', shotId)

    if (error) return { success: false, error: `Failed to set FV: ${error.message}` }
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
        .update({
            final_visual_node_id: null,
            final_visual_take_id: null,
        })
        .eq('id', shotId)

    if (error) return { success: false, error: `Failed to clear FV: ${error.message}` }
    return { success: true }
}

/**
 * Get the Shot's Final Visual reference.
 * Returns nodeId + takeId. UI resolves media from take snapshot.
 */
export async function getShotFinalVisualAction(params: {
    shotId: string
}): Promise<{ nodeId: string; takeId: string } | null> {
    const { shotId } = params
    if (!shotId) return null

    const supabase = await createClient()

    const { data: shot } = await supabase
        .from('shots')
        .select('final_visual_node_id, final_visual_take_id')
        .eq('id', shotId)
        .single()

    if (!shot?.final_visual_node_id || !shot?.final_visual_take_id) return null

    return {
        nodeId: shot.final_visual_node_id,
        takeId: shot.final_visual_take_id,
    }
}