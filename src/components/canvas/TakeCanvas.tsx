'use client'

import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react'
import { NodeShell } from './NodeShell'
import { NoteContent, type NoteData } from './NodeContent'

// ===================================================
// TAKE CANVAS — CONTAINER (R3.7 v2.0 Auto-Persist)
// ===================================================
// R3.7 v2.0: onDirty rimossa, sostituita da onNodesChange.
// Il canvas emette l'intero stato nodes dopo ogni mutazione.
// Il Workspace decide quando e come persistere.

interface TakeCanvasProps {
    takeId: string
    // ── R3.7 v2.0: initialNodes seed-only ──
    // Usato SOLO per inizializzare useState al mount.
    // NON è una prop reattiva. NON genera useEffect.
    initialNodes?: CanvasNode[]
    // ── R3.7 v2.0: onNodesChange ──
    // Emesso dopo ogni mutazione completata (create/move/edit/delete).
    // Passa una copia immutabile dello stato corrente dei nodes.
    // Il Workspace gestisce debounce e persist.
    onNodesChange?: (nodes: CanvasNode[]) => void
}

export interface CanvasNode {
    id: string
    type: 'note'
    x: number
    y: number
    width: number
    height: number
    zIndex: number
    data: NoteData
}

// ── R3.4: Ref imperativo per lettura snapshot on-demand ──
// Mantenuto per Duplica Take (Step 3)
export interface TakeCanvasHandle {
    getSnapshot: () => CanvasNode[]
}

type InteractionMode = 'idle' | 'dragging' | 'editing'

const DRAG_THRESHOLD = 3

export const TakeCanvas = forwardRef<TakeCanvasHandle, TakeCanvasProps>(
    function TakeCanvas({ takeId, initialNodes, onNodesChange }, ref) {
        // ── nodes inizializzati da initialNodes (seed-only) ──
        const [nodes, setNodes] = useState<CanvasNode[]>(
            () => initialNodes ?? []
        )
        const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
        const [interactionMode, setInteractionMode] = useState<InteractionMode>('idle')
        const [editingField, setEditingField] = useState<'title' | 'body' | null>(null)

        const canvasRef = useRef<HTMLDivElement>(null)

        // Drag state (ref per evitare stale closures)
        const dragRef = useRef<{
            nodeId: string
            startNodeX: number
            startNodeY: number
            startMouseX: number
            startMouseY: number
            hasMoved: boolean
        } | null>(null)

        // Ref per accesso a nodes aggiornato nei listener
        const nodesRef = useRef<CanvasNode[]>(nodes)
        useEffect(() => {
            nodesRef.current = nodes
        }, [nodes])

        // ── R3.7 v2.0: emitNodesChange ──
        // Sostituisce markDirty. Emette copia immutabile dei nodes.
        const emitNodesChange = useCallback(() => {
            if (onNodesChange) {
                onNodesChange(structuredClone(nodesRef.current))
            }
        }, [onNodesChange])

        // ── R3.4: Esponi metodo imperativo per lettura snapshot ──
        useImperativeHandle(ref, () => ({
            getSnapshot: () => structuredClone(nodes)
        }), [nodes])

        // Reset su cambio Take
        useEffect(() => {
            setSelectedNodeId(null)
            setInteractionMode('idle')
            setEditingField(null)
            dragRef.current = null
        }, [takeId])

        // ============================================
        // WINDOW DRAG HANDLERS
        // ============================================

        const handleWindowMouseMove = useCallback((e: MouseEvent) => {
            if (!dragRef.current) return

            const deltaX = e.clientX - dragRef.current.startMouseX
            const deltaY = e.clientY - dragRef.current.startMouseY
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

            // Attiva drag solo se supera threshold
            if (!dragRef.current.hasMoved && distance > DRAG_THRESHOLD) {
                dragRef.current.hasMoved = true
                setInteractionMode('dragging')
            }

            if (dragRef.current.hasMoved) {
                e.preventDefault()
                const newX = dragRef.current.startNodeX + deltaX
                const newY = dragRef.current.startNodeY + deltaY

                setNodes((prev) =>
                    prev.map((node) =>
                        node.id === dragRef.current!.nodeId
                            ? { ...node, x: newX, y: newY }
                            : node
                    )
                )
            }
        }, [])

        const handleWindowMouseUp = useCallback(() => {
            window.removeEventListener('mousemove', handleWindowMouseMove)
            window.removeEventListener('mouseup', handleWindowMouseUp)

            // Torna a idle solo se eravamo in dragging
            if (dragRef.current?.hasMoved) {
                setInteractionMode('idle')
                emitNodesChange()  // R3.7: posizione nodo cambiata
            }

            dragRef.current = null
        }, [handleWindowMouseMove, emitNodesChange])

        // Cleanup on unmount
        useEffect(() => {
            return () => {
                window.removeEventListener('mousemove', handleWindowMouseMove)
                window.removeEventListener('mouseup', handleWindowMouseUp)
            }
        }, [handleWindowMouseMove, handleWindowMouseUp])

        // ============================================
        // NODE HANDLERS
        // ============================================

        const handleSelect = useCallback((nodeId: string) => {
            setSelectedNodeId(nodeId)
        }, [])

        const handlePotentialDragStart = useCallback(
            (nodeId: string, mouseX: number, mouseY: number) => {
                const node = nodesRef.current.find((n) => n.id === nodeId)
                if (!node) return

                dragRef.current = {
                    nodeId,
                    startNodeX: node.x,
                    startNodeY: node.y,
                    startMouseX: mouseX,
                    startMouseY: mouseY,
                    hasMoved: false,
                }

                window.addEventListener('mousemove', handleWindowMouseMove)
                window.addEventListener('mouseup', handleWindowMouseUp)
            },
            [handleWindowMouseMove, handleWindowMouseUp]
        )

        const handleDelete = useCallback((nodeId: string) => {
            setNodes((prev) => prev.filter((n) => n.id !== nodeId))
            setSelectedNodeId(null)
            setInteractionMode('idle')
            setEditingField(null)
            emitNodesChange()  // R3.7: nodo eliminato
        }, [emitNodesChange])

        const handleStartEditing = useCallback((nodeId: string, field: 'title' | 'body') => {
            setSelectedNodeId(nodeId)
            setInteractionMode('editing')
            setEditingField(field)
        }, [])

        const handleFieldFocus = useCallback((field: 'title' | 'body') => {
            setEditingField(field)
        }, [])

        const handleFieldBlur = useCallback(() => {
            setInteractionMode('idle')
            setEditingField(null)
        }, [])

        const handleDataChange = useCallback((nodeId: string, data: NoteData) => {
            setNodes((prev) =>
                prev.map((node) =>
                    node.id === nodeId ? { ...node, data } : node
                )
            )
            emitNodesChange()  // R3.7: contenuto nodo modificato
        }, [emitNodesChange])

        // ============================================
        // CANVAS HANDLERS
        // ============================================

        const handleCanvasMouseDown = useCallback(() => {
            // Deseleziona solo se non siamo in editing
            if (interactionMode !== 'editing') {
                setSelectedNodeId(null)
                setInteractionMode('idle')
                setEditingField(null)
            }
        }, [interactionMode])

        const handleCreateNote = useCallback(() => {
            const canvas = canvasRef.current
            if (!canvas) return

            const rect = canvas.getBoundingClientRect()
            const centerX = Math.round(rect.width / 2 - 100)
            const centerY = Math.round(rect.height / 2 - 60)

            const newNode: CanvasNode = {
                id: crypto.randomUUID(),
                type: 'note',
                x: centerX,
                y: centerY,
                width: 200,
                height: 120,
                zIndex: nodes.length + 1,
                data: {},
            }

            setNodes((prev) => [...prev, newNode])
            setSelectedNodeId(newNode.id)
            setInteractionMode('idle')
            emitNodesChange()  // R3.7: nodo creato
        }, [nodes.length, emitNodesChange])

        return (
            <div className="flex-1 flex">
                {/* Tool Rail */}
                <aside className="w-12 bg-zinc-800 flex flex-col items-center py-2 gap-1 shrink-0">
                    <button
                        onClick={handleCreateNote}
                        className="w-9 h-9 bg-zinc-700 hover:bg-zinc-500 hover:scale-105 rounded flex items-center justify-center cursor-pointer transition-all"
                        title="Add Note"
                    >
                        <span className="text-xs text-zinc-400">Note</span>
                    </button>
                </aside>

                {/* Canvas area */}
                <div
                    ref={canvasRef}
                    className="flex-1 bg-zinc-950 relative overflow-hidden"
                    onMouseDown={handleCanvasMouseDown}
                >
                    {nodes.map((node) => (
                        <NodeShell
                            key={node.id}
                            nodeId={node.id}
                            x={node.x}
                            y={node.y}
                            width={node.width}
                            height={node.height}
                            zIndex={node.zIndex}
                            isSelected={node.id === selectedNodeId}
                            isDragging={interactionMode === 'dragging' && dragRef.current?.nodeId === node.id}
                            interactionMode={interactionMode}
                            onSelect={handleSelect}
                            onPotentialDragStart={handlePotentialDragStart}
                            onDelete={handleDelete}

                        >
                            <NoteContent
                                data={node.data}
                                isEditing={interactionMode === 'editing' && node.id === selectedNodeId}
                                editingField={node.id === selectedNodeId ? editingField : null}
                                onDataChange={(data) => handleDataChange(node.id, data)}
                                onFieldFocus={handleFieldFocus}
                                onFieldBlur={handleFieldBlur}
                                onStartEditing={(field) => handleStartEditing(node.id, field)}
                            />
                        </NodeShell>
                    ))}

                    {nodes.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <p className="text-zinc-600 text-sm">Click "Note" to add a node</p>
                        </div>
                    )}
                </div>
            </div>
        )
    })