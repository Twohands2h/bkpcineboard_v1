'use server'

import { createClient } from '@/lib/supabase/server'

// ============================================
// BLOCCO 4C — SHOT SELECTION PROMOTION (v1.1)
// ============================================
// Asset selection registered as decision_note (parent_type='shot').
// Append-only: promote inserts, discard inserts (never deletes).
// v1.1: optional take_id in promote body for FV→Take derivation.

/**
 * Register an asset selection for a shot.
 * Creates a decision_note with event 'promote_asset'.
 * Returns { selectionId, selectionNumber } for badge display.
 */
export async function promoteAssetSelectionAction(params: {
    projectId: string
    shotId: string
    takeId?: string | null
    imageNodeId?: string | null
    imageSnapshot: {
        src: string
        storage_path: string
        naturalWidth: number
        naturalHeight: number
    }
    promptSnapshot?: {
        body: string
        promptType: string
        origin: string
        createdAt?: string
    } | null
}): Promise<{ selectionId: string; selectionNumber: number }> {
    const { projectId, shotId, takeId, imageNodeId, imageSnapshot, promptSnapshot } = params

    if (!projectId) throw new Error('shot-selections: projectId missing')
    if (!shotId) throw new Error('shot-selections: shotId missing')

    const supabase = await createClient()

    // Count existing promote_asset events for this shot
    const { data: existing } = await supabase
        .from('decision_notes')
        .select('id, body')
        .eq('parent_type', 'shot')
        .eq('parent_id', shotId)

    const promoteCount = (existing ?? []).filter(n => {
        try {
            const raw = n.body
            const p = typeof raw === 'string' ? JSON.parse(raw) : raw
            return p?.event === 'promote_asset'
        } catch { return false }
    }).length

    const selectionNumber = promoteCount + 1

    const { data: note, error } = await supabase
        .from('decision_notes')
        .insert({
            project_id: projectId,
            parent_type: 'shot',
            parent_id: shotId,
            body: JSON.stringify({
                event: 'promote_asset',
                selection_number: selectionNumber,
                take_id: takeId ?? null,
                image_node_id: imageNodeId ?? null,
                image_snapshot: imageSnapshot,
                prompt_snapshot: promptSnapshot ?? null,
                created_at: new Date().toISOString(),
            }),
        })
        .select('id')
        .single()

    if (error) {
        throw new Error(`Failed to promote asset: ${error.message}`)
    }

    return { selectionId: note.id, selectionNumber }
}

/**
 * Record a discard event for an asset selection (append-only).
 */
export async function discardAssetSelectionAction(params: {
    projectId: string
    shotId: string
    selectionId: string
    reason: 'undo' | 'manual'
}): Promise<void> {
    const { projectId, shotId, selectionId, reason } = params

    if (!projectId) throw new Error('shot-selections discard: projectId missing')
    if (!shotId) throw new Error('shot-selections discard: shotId missing')
    if (!selectionId) throw new Error('shot-selections discard: selectionId missing')

    const supabase = await createClient()

    const { error } = await supabase.from('decision_notes').insert({
        project_id: projectId,
        parent_type: 'shot',
        parent_id: shotId,
        body: JSON.stringify({
            event: 'discard_promote_asset',
            selection_id: selectionId,
            reason,
            timestamp: new Date().toISOString(),
        }),
    })

    if (error) {
        throw new Error(`Failed to discard selection: ${error.message}`)
    }
}

// ============================================
// READ — Active Selections (derived from append-only log)
// ============================================

export interface ActiveSelection {
    selectionId: string
    selectionNumber: number
    storagePath: string
    src: string
    takeId: string | null
    nodeId: string | null
}

/**
 * Derive active selections for a shot from decision_notes.
 * A selection is active if it has a promote_asset event
 * and no subsequent discard_promote_asset for the same selectionId.
 */
export async function getShotSelectionsAction(params: {
    shotId: string
}): Promise<ActiveSelection[]> {
    const { shotId } = params

    const supabase = await createClient()

    const { data: notes } = await supabase
        .from('decision_notes')
        .select('id, body')
        .eq('parent_type', 'shot')
        .eq('parent_id', shotId)
        .order('created_at', { ascending: true })

    if (!notes || notes.length === 0) return []

    // Build promote map and discard set
    const promotes = new Map<string, { selectionNumber: number; storagePath: string; src: string; takeId: string | null }>()
    const discarded = new Set<string>()

    for (const note of notes) {
        try {
            const raw = note.body
            const p = typeof raw === 'string' ? JSON.parse(raw) : raw
            if (!p || typeof p !== 'object') continue

            if (p.event === 'promote_asset') {
                promotes.set(note.id, {
                    selectionNumber: p.selection_number,
                    storagePath: p.image_snapshot?.storage_path ?? '',
                    src: p.image_snapshot?.src ?? '',
                    takeId: p.take_id ?? null,
                    nodeId: p.image_node_id ?? null,
                })
            } else if (p.event === 'discard_promote_asset' && p.selection_id) {
                discarded.add(p.selection_id)
            }
        } catch { /* skip malformed */ }
    }

    // Active = promoted minus discarded
    const active: ActiveSelection[] = []
    for (const [id, data] of promotes) {
        if (!discarded.has(id)) {
            active.push({ selectionId: id, ...data })
        }
    }
    return active
}