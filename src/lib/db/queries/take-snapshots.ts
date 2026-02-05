// src/lib/db/queries/take-snapshots.ts
// ============================================
// TAKE SNAPSHOTS — Query & Domain Functions
// CineBoard R2 · Persistenza Controllata
// ============================================
//
// take_snapshots = registro storico append-only
// Ogni record è un'istantanea immutabile dei nodes[] di un Take.
// Nessun UPDATE. Nessun DELETE. Solo INSERT e SELECT.
//
// CONSUMATORE: solo ShotWorkspace via server actions.
// NON CONSUMATO DA: TakeCanvas, NodeShell, NodeContent.
//
// ============================================

import { createClient } from '@/lib/supabase/server'

// ── Tipo snapshot per il dominio ──
// Definito inline perché take_snapshots potrebbe non essere
// ancora nel type generator di Supabase (tabella nuova R2).
// Quando lo schema viene rigenerato, sostituire con:
//   type TakeSnapshot = Database['public']['Tables']['take_snapshots']['Row']
interface TakeSnapshotRow {
    id: string
    project_id: string
    scene_id: string
    shot_id: string
    take_id: string
    payload: unknown  // JSONB — i nodes[] serializzati
    reason: 'manual_save' | 'publish' | 'checkpoint'
    created_at: string
    created_by: string
}

type SnapshotReason = TakeSnapshotRow['reason']

// ============================================
// INSERT (append-only)
// ============================================

/**
 * Salva uno snapshot dei nodes[] di un Take.
 *
 * Append-only: ogni chiamata crea un NUOVO record.
 * Nessun overwrite, nessun upsert.
 * Il payload viene salvato così com'è (JSONB).
 *
 * Chiamato solo su gesto esplicito dell'utente
 * o su checkpoint deliberato da ShotWorkspace.
 */
export async function saveTakeSnapshot(data: {
    project_id: string
    scene_id: string
    shot_id: string
    take_id: string
    payload: unknown
    reason: SnapshotReason
}): Promise<TakeSnapshotRow> {
    const supabase = await createClient()

    const { data: snapshot, error } = await supabase
        .from('take_snapshots')
        .insert({
            project_id: data.project_id,
            scene_id: data.scene_id,
            shot_id: data.shot_id,
            take_id: data.take_id,
            payload: data.payload,
            reason: data.reason,
        })
        .select()
        .single()

    if (error) {
        throw new Error(`Failed to save take snapshot: ${error.message}`)
    }

    return snapshot as TakeSnapshotRow
}

// ============================================
// READ
// ============================================

/**
 * Carica l'ultimo snapshot di un Take.
 *
 * Usato da ShotWorkspace al mount per ottenere gli initialNodes.
 * Ritorna null se il Take non ha mai avuto snapshot
 * (canvas partirà vuoto).
 */
export async function loadLatestTakeSnapshot(
    takeId: string
): Promise<TakeSnapshotRow | null> {
    const supabase = await createClient()

    const { data: snapshot, error } = await supabase
        .from('take_snapshots')
        .select('*')
        .eq('take_id', takeId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

    // PGRST116 = no rows found — non è un errore, il Take è semplicemente vuoto
    if (error && error.code !== 'PGRST116') {
        throw new Error(`Failed to load take snapshot: ${error.message}`)
    }

    return (snapshot as TakeSnapshotRow) ?? null
}

/**
 * Carica uno snapshot specifico per ID.
 *
 * Usato per restore: ShotWorkspace sceglie una versione
 * e la usa come nuovi initialNodes (via remount).
 */
export async function loadTakeSnapshotById(
    snapshotId: string
): Promise<TakeSnapshotRow | null> {
    const supabase = await createClient()

    const { data: snapshot, error } = await supabase
        .from('take_snapshots')
        .select('*')
        .eq('id', snapshotId)
        .single()

    if (error && error.code !== 'PGRST116') {
        throw new Error(`Failed to load take snapshot: ${error.message}`)
    }

    return (snapshot as TakeSnapshotRow) ?? null
}
