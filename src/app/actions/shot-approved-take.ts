'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ─────────────────────────────────────────────
// Approved Take — editorial decision
// Invariant: memorizzato SOLO in shots.approved_take_id
// Non modifica FV, non scrive decision_notes
// ─────────────────────────────────────────────

export async function approveTakeAction(shotId: string, takeId: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('shots')
        .update({ approved_take_id: takeId })
        .eq('id', shotId)

    if (error) {
        console.error('[approveTake] failed:', error.message)
        throw new Error('Failed to approve take')
    }
}

export async function revokeTakeAction(shotId: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('shots')
        .update({ approved_take_id: null })
        .eq('id', shotId)

    if (error) {
        console.error('[revokeTake] failed:', error.message)
        throw new Error('Failed to revoke take approval')
    }
}

// ─────────────────────────────────────────────
// Delete Take with atomic approved guard (RPC)
// FV guard is handled client-side BEFORE this call.
// This RPC only handles: clear approved_take_id + delete take
// in a single Postgres transaction.
// ─────────────────────────────────────────────

export async function deleteTakeWithGuardAction(takeId: string) {
    const supabase = await createClient()

    const { error } = await supabase.rpc('delete_take_with_approved_guard', {
        p_take_id: takeId,
    })

    if (error) {
        console.error('[deleteTakeWithGuard] RPC failed:', error.message)
        throw new Error('Failed to delete take')
    }
}