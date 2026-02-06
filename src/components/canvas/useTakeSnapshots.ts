import { useRef, useCallback } from 'react'

// ===================================================
// TAKE SNAPSHOTS — SHOT-SCOPED IN-MEMORY (CineBoard R1.1)
// ===================================================
// Snapshot = copia morta dello stato nodes[] al momento della cattura.
//
// REGOLE STRUTTURALI:
// - Vive SOLO a livello ShotWorkspace
// - Shot muore → Snapshot muore (garbage collected col ref)
// - NON è un context globale, NON è un singleton
// - NON osserva TakeCanvas, NON riceve notifiche
// - Push-based: viene alimentato solo da chiamate esplicite
//
// INVARIANTI:
// - INV-S1: Snapshot ≠ source of truth. Solo TakeCanvas.nodes[] è stato vivo.
// - INV-S2: Snapshot è read-only. Deep copy in capture, deep copy in restore.
//           Nessuna reference condivisa tra snapshot e stato vivo.
// - INV-S3: Restore sostituisce completamente. Niente merge, niente diff.
// - INV-S4: Nessun riferimento a DB, storage, localStorage, server.
// - INV-S5: Nessun autosave, nessun debounce, nessun side-effect.
//
// SEMANTICA:
// Lo snapshot è un "checkpoint di ingresso": fotografa i nodes
// nel momento in cui ShotWorkspace li prepara per TakeCanvas.
// Il reset riporta il canvas a quel checkpoint tramite remount (key change).
// NON è un undo. NON cattura lo stato corrente del canvas.
// ===================================================

// ── Tipo nodo per lo snapshot ──
// SnapshotNode e SnapshotNodeData replicano INTENZIONALMENTE
// la shape di CanvasNode / NoteData definite in TakeCanvas.
// La duplicazione è una scelta architetturale, non un errore:
// lo snapshot NON deve importare da TakeCanvas per evitare
// coupling tra il registro passivo e il container attivo.
// Se la shape di CanvasNode cambia, SnapshotNode va aggiornato
// manualmente — questo è voluto, perché forza una review esplicita.
// Quando i tipi verranno centralizzati (contratti R1.1 Step 1),
// entrambi punteranno alla stessa definizione condivisa.
interface SnapshotNodeData {
    title?: string
    body?: string
}

interface SnapshotNode {
    id: string
    type: 'note'
    x: number
    y: number
    width: number
    height: number
    zIndex: number
    data: SnapshotNodeData
}

interface TakeSnapshot {
    takeId: string
    nodes: SnapshotNode[]
    capturedAt: number
}

/**
 * Hook per gestire snapshot in-memory dei Take.
 * DEVE essere chiamato SOLO dentro ShotWorkspace.
 *
 * Uso:
 *   const { captureSnapshot, restoreSnapshot, clearSnapshots } = useTakeSnapshots()
 *
 *   // Al mount di un Take, prima di passare initialNodes a TakeCanvas:
 *   captureSnapshot(takeId, initialNodes)
 *
 *   // Per resettare un Take al checkpoint di ingresso:
 *   const saved = restoreSnapshot(takeId)
 *   if (saved) { // remount TakeCanvas con saved come initialNodes }
 *
 *   // Al cleanup dello Shot:
 *   clearSnapshots()
 */
export function useTakeSnapshots() {
    // ── Map takeId → snapshot ──
    // useRef e non useState: lo snapshot non deve mai causare re-render.
    // È un registro passivo, non stato reattivo.
    const snapshotsRef = useRef<Map<string, TakeSnapshot>>(new Map())

    /**
     * Cattura uno snapshot dei nodes per un dato Take.
     * Deep copy: spezza ogni reference viva.
     * Se esiste già uno snapshot per quel takeId, lo sovrascrive.
     * Nessun accumulo, nessuna history.
     */
    const captureSnapshot = useCallback(
        (takeId: string, nodes: SnapshotNode[]): void => {
            // Deep copy per spezzare ogni reference con lo stato vivo
            const frozenNodes = structuredClone(nodes)

            const snapshot: TakeSnapshot = {
                takeId,
                nodes: frozenNodes,
                capturedAt: Date.now(),
            }

            snapshotsRef.current.set(takeId, snapshot)
        },
        []
    )

    /**
     * Ripristina lo snapshot per un dato Take.
     * Ritorna un NUOVO deep copy (il consumatore non può mutare lo snapshot originale).
     * Ritorna null se nessuno snapshot esiste per quel takeId.
     * Nessun side-effect: il consumatore decide cosa farne.
     */
    const restoreSnapshot = useCallback(
        (takeId: string): SnapshotNode[] | null => {
            const snapshot = snapshotsRef.current.get(takeId)
            if (!snapshot) return null

            // Deep copy anche in uscita: lo snapshot originale resta intatto.
            // Se qualcuno muta i nodes restituiti, lo snapshot non ne risente.
            return structuredClone(snapshot.nodes)
        },
        []
    )

    /**
     * Svuota tutti gli snapshot.
     * Chiamare al cleanup dello ShotWorkspace o per reset esplicito.
     * Dopo la chiamata, restoreSnapshot ritorna null per qualsiasi takeId.
     */
    const clearSnapshots = useCallback((): void => {
        snapshotsRef.current.clear()
    }, [])

    return { captureSnapshot, restoreSnapshot, clearSnapshots } as const
}

// ── Export dei tipi per ShotWorkspace ──
export type { SnapshotNode, TakeSnapshot }
