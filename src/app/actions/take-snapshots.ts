// src/app/actions/take-snapshots.ts
'use server'

import {
    saveTakeSnapshot,
    loadLatestTakeSnapshot,
    loadTakeSnapshotById,
} from '@/lib/db/queries/take-snapshots'

// ===================================================
// TAKE SNAPSHOTS — Server Actions
// CineBoard R2 · Persistenza Controllata
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
