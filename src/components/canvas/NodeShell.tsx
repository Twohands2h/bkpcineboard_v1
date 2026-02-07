'use client'

import { useCallback } from 'react'

// ===================================================
// NODE SHELL — INTERACTION LAYER (R4-001)
// ===================================================
// R1: select, drag, z-index, delete.
// R4-001: resize handle (bottom-right corner).
//
// INVARIANTI:
// - INV-1: editing attivo → niente drag, niente selezione, niente resize
// - INV-2: dragging attivo → niente editing, niente input interni
// - INV-3: delete solo in idle
// - INV-4: selezione solo esplicita
// - INV-5: resizing attivo → niente drag, niente editing
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
            {/* Delete button: solo idle + selected */}
            {isSelected && interactionMode === 'idle' && (
                <button
                    onClick={handleDelete}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 hover:bg-red-600 text-white text-xs rounded-full flex items-center justify-center z-10"
                >
                    ✕
                </button>
            )}

            {/* R4-001: Resize handle — solo selected + idle */}
            {isSelected && interactionMode === 'idle' && (
                <div
                    onMouseDown={handleResizeMouseDown}
                    className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize z-10"
                    style={{
                        background: 'linear-gradient(135deg, transparent 50%, #3b82f6 50%)',
                    }}
                />
            )}

            {/* Pointer block during drag or resize */}
            {(isDragging || isResizing) && (
                <div className="absolute inset-0 z-[1]" style={{ pointerEvents: 'all' }} />
            )}

            {/* Content */}
            {children}
        </div>
    )
}