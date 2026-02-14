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
// R4.0a: Delete ✕ button removed — deletion via Delete/Backspace only.

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
    // Step 1B — Take Output (video nodes only)
    nodeType?: string
    isOutputVideo?: boolean
    onToggleOutputVideo?: () => void
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
    nodeType,
    isOutputVideo,
    onToggleOutputVideo,
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
            className={`absolute select-none bg-zinc-800 border ${isOutputVideo ? 'border-emerald-600' : 'border-zinc-700'} shadow-lg ${isSelected ? 'ring-2 ring-blue-500' : ''} ${isDragging ? 'cursor-grabbing opacity-90' : 'cursor-grab'}`}
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
                    {/* Resize handle — pinned to bottom-right corner */}
                    <div
                        onMouseDown={handleResizeMouseDown}
                        className="absolute w-8 h-8 cursor-se-resize z-50 flex items-center justify-center"
                        style={{
                            bottom: -10,
                            right: -10,
                            transform: `scale(${cs})`,
                            transformOrigin: 'bottom right',
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
                            marginTop: -8 * cs,
                            transform: `scale(${cs})`,
                            transformOrigin: 'right center',
                        }}
                        title="Drag to connect"
                    >
                        <div className="w-2.5 h-2.5 bg-emerald-500 group-hover:bg-emerald-400 group-hover:scale-125 rounded-full transition-transform" />
                    </div>

                    {/* Step 1B: Output toggle — video nodes only */}
                    {nodeType === 'video' && onToggleOutputVideo && (
                        <div
                            className="absolute z-50"
                            style={{
                                top: -4,
                                left: -4,
                                transform: `scale(${cs})`,
                                transformOrigin: 'bottom right',
                            }}
                        >
                            <button
                                onMouseDown={(e) => { e.stopPropagation(); e.preventDefault() }}
                                onClick={(e) => { e.stopPropagation(); onToggleOutputVideo() }}
                                className={`px-1.5 py-0.5 text-[9px] font-medium border transition-colors ${isOutputVideo
                                    ? 'bg-emerald-900/80 border-emerald-600 text-emerald-400 hover:bg-red-900/60 hover:border-red-500 hover:text-red-400'
                                    : 'bg-zinc-800 border-zinc-600 text-zinc-400 hover:border-emerald-500 hover:text-emerald-400'
                                    }`}
                                title={isOutputVideo ? 'Remove Take Output' : 'Set as Take Output'}
                            >
                                {isOutputVideo ? 'Output ✓' : 'Output'}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Step 1B: Output badge — always visible when is output and not showing controls */}
            {isOutputVideo && !showControls && (
                <div
                    className="absolute z-40 pointer-events-none"
                    style={{
                        top: -2,
                        right: -2,
                        transform: `scale(${cs})`,
                        transformOrigin: 'bottom left',
                    }}
                >
                    <span className="px-1 py-0.5 text-[8px] font-medium bg-emerald-900/80 border border-emerald-700 text-emerald-400">
                        Output
                    </span>
                </div>
            )}

            {/* Pointer block during drag or resize */}
            {(isDragging || isResizing) && (
                <div className="absolute inset-0 z-[1]" style={{ pointerEvents: 'all' }} />
            )}
        </div>
    )
}