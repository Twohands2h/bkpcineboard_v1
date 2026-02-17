'use client'

import { useCallback } from 'react'

// ===================================================
// NODE SHELL — SANDWICH LAYERING (R4-005b)
// ===================================================
// R4 Visual Language: ZERO ROUNDED. Angoli retti 90°.
// R4-003: Connection handle per edge creation.
// R4-005b: Controls counter-scaled. Gated on idle.
// R4.0a: Delete ✕ removed — deletion via Delete/Backspace only.
// Step 1B: Border-only visual state. No internal badges or toggles.
//          Micro-tab + pills live in TakeCanvas render.
// Handle anchoring: bottom:0/right:0 + translate(50%) + scale(cs).
//                   No offset multiplication. No marginTop. Zero drift.

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
    // Passive visual state — border only
    isOutputVideo?: boolean
    isFinalVisual?: boolean
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
    isOutputVideo,
    isFinalVisual,
    children,
}: NodeShellProps) {
    const isResizing = interactionMode === 'resizing'
    const cs = 1 / viewportScale

    const showControls = isSelected && !isDragging && interactionMode !== 'resizing' && interactionMode !== 'connecting'
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
            className={`absolute select-none box-border bg-zinc-800 ${isFinalVisual ? 'border-2 border-emerald-500' : isOutputVideo ? 'border-2 border-emerald-600' : 'border border-zinc-700'} shadow-lg ${isSelected ? 'ring-2 ring-blue-500' : ''} ${isDragging ? 'opacity-90' : ''}`}
            style={{
                transform: `translate(${x}px, ${y}px)`,
                width,
                height,
                zIndex: isDragging ? 99999 : zIndex,
            }}
            onMouseDown={handleMouseDown}
            onClick={handleClick}
        >
            {/* VIEWPORT — clean, no overlays */}
            <div className="w-full h-full overflow-hidden flex flex-col">
                {children}
            </div>
            {/* Passive dot — FV or Output indicator, always visible */}
            {(isFinalVisual || isOutputVideo) && (
                <div className="absolute top-1 right-1 pointer-events-none z-20">
                    <div className="w-2 h-2 rounded-full bg-emerald-400/90 shadow-sm" />
                </div>
            )}

            {/* CONTROLS — gated on idle, counter-scaled
                Anchoring: position at exact node edge (bottom:0, right:0, top:50%)
                then translate to center on the edge point, then scale(cs).
                No offset multiplication, no marginTop, zero drift. */}
            {showControls && (
                <div
                    style={{
                        opacity: controlsActive ? 1 : 0.4,
                        pointerEvents: controlsActive ? 'auto' : 'none',
                    }}
                >
                    {/* Resize handle — anchored at bottom-right corner */}
                    <div
                        onMouseDown={handleResizeMouseDown}
                        className="absolute z-50 cursor-se-resize flex items-center justify-center"
                        style={{
                            bottom: 0,
                            right: 0,
                            width: 16 * cs,
                            height: 16 * cs,
                            transform: `translate(50%, 50%) scale(${cs})`,
                            transformOrigin: 'center',
                        }}
                    >
                        <div
                            className="rounded-full bg-blue-500"
                            style={{ width: 6, height: 6 }}
                        />
                    </div>

                    {/* Connection handle — anchored at mid-right edge */}
                    <div
                        onMouseDown={handleConnectionMouseDown}
                        className="absolute z-50 cursor-crosshair flex items-center justify-center group"
                        style={{
                            right: 0,
                            top: '50%',
                            width: 16 * cs,
                            height: 16 * cs,
                            transform: `translate(50%, -50%) scale(${cs})`,
                            transformOrigin: 'center',
                        }}
                        title="Drag to connect"
                    >
                        <div
                            className="rounded-full bg-emerald-500 group-hover:bg-emerald-400 group-hover:scale-125 transition-transform"
                            style={{ width: 8, height: 8 }}
                        />
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