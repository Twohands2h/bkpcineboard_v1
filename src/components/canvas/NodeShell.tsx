'use client'

import { useCallback } from 'react'

// ===================================================
// NODE SHELL — SANDWICH LAYERING (R4-001a final)
// ===================================================
// Shell esterno: posizione, dimensione, bg, border, ring. NO overflow.
// Viewport interno: overflow-hidden, clippa il contenuto.
// Controlli (✕, resize): sul shell, fuori dal viewport.
// Auto-grow: gestito internamente da NodeContent, NON qui.

interface NodeShellProps {
    nodeId: string
    x: number
    y: number
    width: number
    height: number
    zIndex: number
    isSelected: boolean
    isDragging: boolean
    interactionMode: 'idle' | 'dragging' | 'editing' | 'resizing'
    onSelect: (nodeId: string) => void
    onPotentialDragStart: (nodeId: string, mouseX: number, mouseY: number) => void
    onDelete: (nodeId: string) => void
    onResizeStart: (nodeId: string, mouseX: number, mouseY: number) => void
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
    onResizeStart,
    children,
}: NodeShellProps) {
    const isResizing = interactionMode === 'resizing'

    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            if (interactionMode === 'editing') return
            if (interactionMode === 'dragging') return
            if (interactionMode === 'resizing') return

            e.stopPropagation()
            onSelect(nodeId)
            onPotentialDragStart(nodeId, e.clientX, e.clientY)
        },
        [nodeId, interactionMode, onSelect, onPotentialDragStart]
    )

    const handleClick = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation()
        },
        []
    )

    const handleDelete = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation()
            if (interactionMode !== 'idle') return
            onDelete(nodeId)
        },
        [nodeId, interactionMode, onDelete]
    )

    const handleResizeMouseDown = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation()
            e.preventDefault()
            if (interactionMode !== 'idle') return
            onResizeStart(nodeId, e.clientX, e.clientY)
        },
        [nodeId, interactionMode, onResizeStart]
    )

    return (
        <div
            className={`absolute select-none rounded-xl bg-zinc-800 border border-zinc-700 shadow-lg ${isSelected ? 'ring-2 ring-blue-500' : ''} ${isDragging ? 'cursor-grabbing opacity-90' : 'cursor-grab'}`}
            style={{
                transform: `translate(${x}px, ${y}px)`,
                width,
                height,
                zIndex: isDragging ? 99999 : zIndex,
            }}
            onMouseDown={handleMouseDown}
            onClick={handleClick}
        >
            {/* VIEWPORT: clippa il contenuto */}
            <div className="w-full h-full overflow-hidden rounded-xl flex flex-col">
                {children}
            </div>

            {/* CONTROLLI: fuori dal viewport, non clippati */}
            {isSelected && interactionMode === 'idle' && (
                <button
                    onClick={handleDelete}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 hover:bg-red-600 text-white text-xs rounded-full flex items-center justify-center z-50"
                >
                    ✕
                </button>
            )}
            {isSelected && interactionMode === 'idle' && (
                <div
                    onMouseDown={handleResizeMouseDown}
                    className="absolute -bottom-1 -right-1 w-4 h-4 cursor-se-resize z-50 flex items-center justify-center"
                >
                    <div className="w-2 h-2 bg-blue-500 rounded-full" />
                </div>
            )}

            {/* Pointer block during drag or resize */}
            {(isDragging || isResizing) && (
                <div className="absolute inset-0 z-[1]" style={{ pointerEvents: 'all' }} />
            )}
        </div>
    )
}