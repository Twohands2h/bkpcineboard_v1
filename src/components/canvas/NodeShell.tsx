'use client'

import { useCallback } from 'react'

// ===================================================
// NODE SHELL — SANDWICH LAYERING (R4-003)
// ===================================================
// R4 Visual Language: ZERO ROUNDED. Angoli retti 90°.
// R4-003: Connection handle per edge creation.

interface NodeShellProps {
    nodeId: string
    x: number
    y: number
    width: number
    height: number
    zIndex: number
    isSelected: boolean
    isDragging: boolean
    interactionMode: 'idle' | 'dragging' | 'editing' | 'resizing' | 'selecting' | 'connecting'
    onSelect: (nodeId: string) => void
    onPotentialDragStart: (nodeId: string, mouseX: number, mouseY: number) => void
    onDelete: (nodeId: string) => void
    onResizeStart: (nodeId: string, mouseX: number, mouseY: number) => void
    onConnectionStart?: (nodeId: string, mouseX: number, mouseY: number) => void
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
    onConnectionStart,
    children,
}: NodeShellProps) {
    const isResizing = interactionMode === 'resizing'

    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            if (interactionMode === 'editing') return
            if (interactionMode === 'dragging') return
            if (interactionMode === 'resizing') return
            if (interactionMode === 'connecting') return

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

    const handleConnectionMouseDown = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation()
            e.preventDefault()
            if (interactionMode !== 'idle') return
            onConnectionStart?.(nodeId, e.clientX, e.clientY)
        },
        [nodeId, interactionMode, onConnectionStart]
    )

    return (
        <div
            className={`absolute select-none bg-zinc-800 border border-zinc-700 shadow-lg ${isSelected ? 'ring-2 ring-blue-500' : ''} ${isDragging ? 'cursor-grabbing opacity-90' : 'cursor-grab'}`}
            style={{
                transform: `translate(${x}px, ${y}px)`,
                width,
                height,
                zIndex: isDragging ? 99999 : zIndex,
            }}
            onMouseDown={handleMouseDown}
            onClick={handleClick}
        >
            {/* VIEWPORT */}
            <div className="w-full h-full overflow-hidden flex flex-col">
                {children}
            </div>

            {/* CONTROLLI */}
            {isSelected && interactionMode === 'idle' && (
                <>
                    {/* Delete */}
                    <button
                        onClick={handleDelete}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 hover:bg-red-600 text-white text-xs rounded-full flex items-center justify-center z-50"
                    >
                        ✕
                    </button>

                    {/* Resize handle */}
                    <div
                        onMouseDown={handleResizeMouseDown}
                        className="absolute -bottom-1 -right-1 w-4 h-4 cursor-se-resize z-50 flex items-center justify-center"
                    >
                        <div className="w-2 h-2 bg-blue-500 rounded-full" />
                    </div>

                    {/* R4-003: Connection handle — top-right, offset from delete */}
                    <div
                        onMouseDown={handleConnectionMouseDown}
                        className="absolute top-1/2 -right-3 -translate-y-1/2 w-4 h-4 cursor-crosshair z-50 flex items-center justify-center group"
                        title="Drag to connect"
                    >
                        <div className="w-2.5 h-2.5 bg-emerald-500 group-hover:bg-emerald-400 group-hover:scale-125 rounded-full transition-transform" />
                    </div>
                </>
            )}

            {/* Pointer block during drag or resize */}
            {(isDragging || isResizing) && (
                <div className="absolute inset-0 z-[1]" style={{ pointerEvents: 'all' }} />
            )}
        </div>
    )
}