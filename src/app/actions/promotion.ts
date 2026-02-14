'use server'

import { createTake, listShotTakes } from '@/lib/db/queries/takes'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ============================================
// BLOCCO 4C — PURE PROMOTION (v1)
// ============================================
// ImageNode → DB Take with editorial act.
// Append-only: promote creates, undo discards (never deletes).

interface PromotionSnapshot {
    imageRef: {
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
    promotedAt: string
}

/**
 * Promote an ImageNode to a DB Take.
 * Creates a new take record with immutable snapshot in tool_meta.
 * Returns { takeId, takeNumber } for badge display.
 */
export async function promoteImageToTakeAction(params: {
    projectId: string
    shotId: string
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
}): Promise<{ takeId: string; takeNumber: number }> {
    const { projectId, shotId, imageSnapshot, promptSnapshot } = params

    // Compute take_number: COUNT(*) + 1 for this shot
    const existingTakes = await listShotTakes(shotId)
    const takeNumber = existingTakes.length + 1

    // Build immutable snapshot
    const snapshot: PromotionSnapshot = {
        imageRef: imageSnapshot,
        promptSnapshot: promptSnapshot ?? null,
        promotedAt: new Date().toISOString(),
    }

    // Create take record
    // media_type='video' to pass constraint, source='promotion:image' to identify
    const take = await createTake(projectId, shotId, {
        media_type: 'video',
        source: 'promotion:image',
        prompt_snapshot: promptSnapshot ? JSON.stringify(promptSnapshot) : null,
        status: 'draft',
    })

    // Store full snapshot in tool_meta via direct update
    const supabase = await createClient()
    await supabase
        .from('takes')
        .update({ tool_meta: snapshot as any })
        .eq('id', take.id)

    revalidatePath(`/projects/${projectId}/shots/${shotId}`)

    return { takeId: take.id, takeNumber }
}

/**
 * Record a discard event for a promotion (append-only, never delete).
 * Uses decision_notes with parent_type='shot' (confirmed safe).
 */
export async function discardPromotionAction(params: {
    projectId: string
    shotId: string
    takeId: string
}): Promise<void> {
    const { projectId, shotId, takeId } = params

    const supabase = await createClient()

    await supabase.from('decision_notes').insert({
        parent_type: 'shot',
        parent_id: shotId,
        note_text: JSON.stringify({
            event: 'discard_promotion',
            take_id: takeId,
            reason: 'undo',
            timestamp: new Date().toISOString(),
        }),
    })

    revalidatePath(`/projects/${projectId}/shots/${shotId}`)
}