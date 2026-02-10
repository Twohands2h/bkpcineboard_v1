'use client'

import { useCallback } from 'react'

// ===================================================
// NODE SHELL — SANDWICH LAYERING (R4-005b)
// ===================================================
// R4 Visual Language: ZERO ROUNDED. Angoli retti 90°.
// R4-003: Connection handle per edge creation.
// R4-005b: Controls counter-scaled with transformOrigin at anchor corner.
//          Controls gated on idle — dimmed + non-interactive otherwise.
//          interactionMode must always return to idle deterministically.

interface NodeShellProps {
    nodeId: string
    x: number
    y: number
    width: number
    height: number
    zIndex: number
    isSelected: boolean
    isDragging: boolean
    interactionMode: 'idle' | 'dragging' | 'editing' | 'resizing' | 'selecting' | 'connecting' | 'panning'
    viewportScale?: number
    onSelect: (nodeId: string, additive: boolean) => void
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
    viewportScale = 1,
    onSelect,
    onPotentialDragStart,
    onDelete,
    onResizeStart,
    onConnectionStart,
    children,
}: NodeShellProps) {
    const isResizing = interactionMode === 'resizing'
    const cs = 1 / viewportScale

    // Controls visible when selected + not in active node manipulation
    const showControls = isSelected && !isDragging && interactionMode !== 'resizing' && interactionMode !== 'connecting'
    // Interactive only when idle
    const controlsActive = interactionMode === 'idle'

    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            if (interactionMode === 'editing') return
            if (interactionMode === 'dragging') return
            if (interactionMode === 'resizing') return
            if (interactionMode === 'connecting') return
            if (interactionMode === 'panning') return

            e.stopPropagation()
            const additive = e.metaKey || e.ctrlKey
            onSelect(nodeId, additive)
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
            if (!controlsActive) return
            onDelete(nodeId)
        },
        [nodeId, controlsActive, onDelete]
    )

    const handleResizeMouseDown = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation()
            e.preventDefault()
            if (!controlsActive) return
            onResizeStart(nodeId, e.clientX, e.clientY)
        },
        [nodeId, controlsActive, onResizeStart]
    )

    const handleConnectionMouseDown = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation()
            e.preventDefault()
            if (!controlsActive) return
            onConnectionStart?.(nodeId, e.clientX, e.clientY)
        },
        [nodeId, controlsActive, onConnectionStart]
    )

    return (
        <div
            data-node-shell
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

            {/* CONTROLLI — R4-005b
                Gated on idle: full opacity + interactive when idle,
                dimmed + pointer-events:none otherwise.
                Anchor: px offset from node corner.
                Scale: 1/viewportScale, transformOrigin at anchor corner. */}
            {showControls && (
                <div
                    style={{
                        opacity: controlsActive ? 1 : 0.4,
                        pointerEvents: controlsActive ? 'auto' : 'none',
                    }}
                >
                    {/* Delete — pinned to top-right corner */}
                    <button
                        onClick={handleDelete}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="absolute w-5 h-5 bg-red-500 hover:bg-red-600 text-white text-xs rounded-full flex items-center justify-center z-50"
                        style={{
                            top: -8,
                            right: -8,
                            transform: `scale(${cs})`,
                            transformOrigin: 'bottom left',
                        }}
                    >
                        ✕
                    </button>

                    {/* Resize handle — pinned to bottom-right corner */}
                    <div
                        onMouseDown={handleResizeMouseDown}
                        className="absolute w-8 h-8 cursor-se-resize z-50 flex items-center justify-center"
                        style={{
                            bottom: -10,
                            right: -10,
                            transform: `scale(${cs})`,
                            transformOrigin: 'top left',
                        }}
                    >
                        <div className="w-2 h-2 bg-blue-500 rounded-full" />
                    </div>

                    {/* Connection handle — pinned to mid-right edge */}
                    <div
                        onMouseDown={handleConnectionMouseDown}
                        className="absolute w-4 h-4 cursor-crosshair z-50 flex items-center justify-center group"
                        style={{
                            top: '50%',
                            right: -12,
                            marginTop: -8,
                            transform: `scale(${cs})`,
                            transformOrigin: 'left center',
                        }}
                        title="Drag to connect"
                    >
                        <div className="w-2.5 h-2.5 bg-emerald-500 group-hover:bg-emerald-400 group-hover:scale-125 rounded-full transition-transform" />
                    </div>
                </div>
            )}

            {/* Pointer block during drag or resize */}
            {(isDragging || isResizing) && (
                <div className="absolute inset-0 z-[1]" style={{ pointerEvents: 'all' }} />
            )}
        </div>
    )
}