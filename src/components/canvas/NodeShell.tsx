'use client'

import { useCallback } from 'react'

// ===================================================
// NODE SHELL — INTERACTION LAYER (CineBoard R1)
// ===================================================
// Hardened in R1.1 — Contract enforcement.
//
// RESPONSABILITÀ: select, drag, z-index, delete.
// NON conosce il tipo di nodo.
// NON gestisce editing.
// NON muta contenuto semantico.
//
// INVARIANTI BLINDATI:
// - INV-1: editing attivo → niente drag, niente selezione
// - INV-2: dragging attivo → niente editing, niente input interni
// - INV-3: delete solo in idle
// - INV-4: selezione solo esplicita, mai implicita
// - INV-5: z-index aggiornato solo su selezione, mai su hover/mount
// ===================================================

interface NodeShellProps {
    nodeId: string
    x: number
    y: number
    width: number
    height: number
    zIndex: number
    isSelected: boolean
    isDragging: boolean
    interactionMode: 'idle' | 'dragging' | 'editing'
    onSelect: (nodeId: string) => void
    onPotentialDragStart: (nodeId: string, mouseX: number, mouseY: number) => void
    onDelete: (nodeId: string) => void
    children: React.ReactNode
}

export function NodeShell({
    nodeId,
    x,
    y,
    width,
    height,
    zIndex,
    isSelected,
    isDragging,
    interactionMode,
    onSelect,
    onPotentialDragStart,
    onDelete,
    children,
}: NodeShellProps) {
    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            // ── INV-1: editing attivo → BLOCCO TOTALE ──
            // Durante editing, NodeShell non può né selezionare né avviare drag.
            // L'utente sta interagendo con NodeContent (input/textarea).
            // Qualsiasi azione Shell corromperebbe lo stato.
            if (interactionMode === 'editing') return

            // ── INV-2: dragging attivo → niente nuova interazione ──
            // Se un drag è già in corso (su un altro nodo o sullo stesso),
            // non avviare una nuova selezione/drag. Il drag è gestito
            // a livello window da TakeCanvas, non da Shell.
            if (interactionMode === 'dragging') return

            e.stopPropagation()
            onSelect(nodeId)
            onPotentialDragStart(nodeId, e.clientX, e.clientY)
        },
        [nodeId, interactionMode, onSelect, onPotentialDragStart]
    )

    const handleClick = useCallback(
        (e: React.MouseEvent) => {
            // ── Difesa propagazione ──
            // Impedisce che il click raggiunga il canvas (che deseleziona).
            // Non è un handler di selezione: la selezione avviene in mouseDown.
            e.stopPropagation()
        },
        []
    )

    const handleDelete = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation()

            // ── INV-3: delete solo in idle ──
            // Se arriva durante drag o editing → IGNORA silenziosamente.
            // Il pulsante è già nascosto in quei casi (difesa visiva),
            // ma questo guard protegge da race condition o future modifiche al render.
            if (interactionMode !== 'idle') return

            onDelete(nodeId)
        },
        [nodeId, interactionMode, onDelete]
    )

    return (
        <div
            className={`absolute select-none ${isSelected ? 'ring-2 ring-blue-500' : ''
                } ${isDragging ? 'cursor-grabbing opacity-90' : 'cursor-grab'}`}
            style={{
                left: x,
                top: y,
                width,
                minHeight: height,
                zIndex: isDragging ? 99999 : zIndex,
            }}
            onMouseDown={handleMouseDown}
            onClick={handleClick}
        >
            {/* ── INV-3 (visivo): delete button solo in idle ──
                Il guard logico è in handleDelete. Questo è il guard visivo:
                nasconde il pulsante durante dragging E editing. */}
            {isSelected && interactionMode === 'idle' && (
                <button
                    onClick={handleDelete}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 hover:bg-red-600 text-white text-xs rounded-full flex items-center justify-center z-10"
                >
                    ✕
                </button>
            )}

            {/* ── INV-2 (fallback fisico): blocco input durante dragging ──
                ATTENZIONE: questo overlay è una difesa FISICA, non la source of truth.
                L'invariante "durante dragging non può avviarsi editing" è garantito
                dalla logica in TakeCanvas (interactionMode state machine).
                Questo overlay è un fallback: se un futuro NodeContent non rispetta
                il contratto, il pointer-events: none impedisce fisicamente
                che click/doubleclick raggiungano gli input interni.
                NON basare mai la logica su questo overlay. Se lo rimuovi,
                l'invariante DEVE reggere comunque a livello logico. */}
            {isDragging && (
                <div className="absolute inset-0 z-[1]" style={{ pointerEvents: 'all' }} />
            )}

            {/* Content */}
            {children}
        </div>
    )
}