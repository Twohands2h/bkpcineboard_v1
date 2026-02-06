// src/app/actions/take-snapshots.ts
'use server'

import {
    saveTakeSnapshot,
    loadLatestTakeSnapshot,
    loadTakeSnapshotById,
    listTakeSnapshots,
} from '@/lib/db/queries/take-snapshots'
import { createTake } from '@/lib/db/queries/takes'
import { createClient } from '@/lib/supabase/server'

// ===================================================
// TAKE SNAPSHOTS — Server Actions
// CineBoard R2 · Persistenza Controllata
// R3.5 · Snapshot History Read-Only
// R3.6 · Snapshot Restore as Branch
// ===================================================
// Thin layer: valida input, delega alle query functions.
//
// CONSUMATORE: solo ShotWorkspace.
// NON CONSUMATO DA: TakeCanvas, NodeShell, NodeContent.
//
// Nessun revalidatePath. Nessuna cache invalidation.
// Il DB è registro storico, non stato UI.
// ===================================================

/**
 * Salva uno snapshot (append-only).
 *
 * Chiamato solo su gesto esplicito dell'utente.
 * Nessun autosave. Nessun debounce.
 */
export async function saveTakeSnapshotAction(params: {
    project_id: string
    scene_id: string
    shot_id: string
    take_id: string
    payload: unknown
    reason: 'manual_save' | 'publish' | 'checkpoint'
}) {
    if (!params.project_id || !params.scene_id || !params.shot_id || !params.take_id) {
        throw new Error('All IDs (project, scene, shot, take) are required')
    }

    if (!params.payload) {
        throw new Error('Payload is required')
    }

    if (!params.reason) {
        throw new Error('Reason is required')
    }

    const snapshot = await saveTakeSnapshot(params)
    return { id: snapshot.id, created_at: snapshot.created_at }
}

/**
 * Carica l'ultimo snapshot di un Take.
 *
 * Ritorna null se il Take non ha snapshot (canvas partirà vuoto).
 */
export async function loadLatestTakeSnapshotAction(takeId: string) {
    if (!takeId) {
        throw new Error('takeId is required')
    }

    const snapshot = await loadLatestTakeSnapshot(takeId)

    if (!snapshot) return null

    return {
        id: snapshot.id,
        payload: snapshot.payload,
        reason: snapshot.reason,
        created_at: snapshot.created_at,
    }
}

/**
 * Carica uno snapshot specifico per ID (per restore).
 *
 * Ritorna null se lo snapshot non esiste.
 */
export async function loadTakeSnapshotByIdAction(snapshotId: string) {
    if (!snapshotId) {
        throw new Error('snapshotId is required')
    }

    const snapshot = await loadTakeSnapshotById(snapshotId)

    if (!snapshot) return null

    return {
        id: snapshot.id,
        take_id: snapshot.take_id,
        payload: snapshot.payload,
        reason: snapshot.reason,
        created_at: snapshot.created_at,
    }
}

/**
 * R3.5: Lista snapshot di un Take per history read-only
 * 
 * Audit trail: ultimi N snapshot ordinati per created_at DESC.
 * Nessuna azione mutativa, solo visualizzazione.
 */
export async function loadAllTakeSnapshotsAction(
    takeId: string,
    limit: number = 10
) {
    if (!takeId) {
        throw new Error('takeId is required')
    }

    const snapshots = await listTakeSnapshots(takeId, limit)

    return snapshots.map(snapshot => ({
        id: snapshot.id,
        reason: snapshot.reason,
        created_at: snapshot.created_at,
    }))
}

/**
/**
 * R3.6: Restore Snapshot as Branch
 * 
 * Crea un NUOVO Take dallo snapshot, senza modificare quello originale.
 * Il nuovo Take parte con initialNodes = snapshot.payload.
 * 
 * Restore = Branch, non Undo.
 * Database = registro storico immutabile.
 * 
 * @param snapshotId - ID dello snapshot da ripristinare
 * @param customName - Nome opzionale per il nuovo Take
 * @returns Composito { take, snapshot } per hand-off restore
 */
export async function createTakeFromSnapshotAction(
    snapshotId: string,
    customName?: string
) {
    if (!snapshotId) {
        throw new Error('snapshotId is required')
    }

    // 1. Carica lo snapshot
    const snapshot = await loadTakeSnapshotById(snapshotId)
    if (!snapshot) {
        throw new Error('Snapshot not found')
    }

    // 2. Genera nome default se non fornito
    let takeName = customName
    if (!takeName) {
        const snapshotDate = new Date(snapshot.created_at)
        const timeString = snapshotDate.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        })
        takeName = `Take (from ${timeString})`
    }

    // 3. Calcola order_index (logica nella Server Action, non nella query)
    const supabase = await createClient()
    const { data: existingTakes } = await supabase
        .from('takes')
        .select('order_index')
        .eq('shot_id', snapshot.shot_id)
        .order('order_index', { ascending: false })
        .limit(1)
    
    const nextOrderIndex = existingTakes && existingTakes.length > 0 
        ? existingTakes[0].order_index + 1 
        : 0

    // 4. Crea nuovo Take (query atomica)
    const newTake = await createTake({
        shot_id: snapshot.shot_id,
        name: takeName,
        description: `Restored from snapshot ${snapshot.id}`,
        status: 'draft',
        order_index: nextOrderIndex,
    })

    // 5. Salva snapshot iniziale per il nuovo Take
    //    Tentativo reason = 'restore_from_snapshot'
    //    Fallback = 'manual_save' se ENUM non supporta
    let snapshotReason: 'restore_from_snapshot' | 'manual_save' = 'restore_from_snapshot'
    
    try {
        await saveTakeSnapshot({
            project_id: snapshot.project_id,
            scene_id: snapshot.scene_id,
            shot_id: snapshot.shot_id,
            take_id: newTake.id,
            payload: snapshot.payload,
            reason: snapshotReason as any,  // Tentativo con cast
        })
    } catch (error) {
        // Fallback a manual_save se restore_from_snapshot non supportato
        snapshotReason = 'manual_save'
        await saveTakeSnapshot({
            project_id: snapshot.project_id,
            scene_id: snapshot.scene_id,
            shot_id: snapshot.shot_id,
            take_id: newTake.id,
            payload: snapshot.payload,
            reason: 'manual_save',
        })
    }

    // 6. Return composito (hand-off restore)
    //    Payload resta proprietà dello snapshot
    return {
        take: {
            id: newTake.id,
            name: newTake.name,
            shot_id: newTake.shot_id,
            status: newTake.status,
            order_index: newTake.order_index,
            created_at: newTake.created_at,
            updated_at: newTake.updated_at,
        },
        snapshot: {
            id: snapshot.id,
            payload: snapshot.payload,
            created_at: snapshot.created_at,
            reason: snapshotReason,
        }
    }
}
