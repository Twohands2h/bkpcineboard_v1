'use client'

import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react'
import { NodeShell } from './NodeShell'
import { NoteContent, type NoteData } from './NodeContent'

// ===================================================
// TAKE CANVAS — CONTAINER (R3.7 v2.0 + R3.7-004A)
// ===================================================
// Step 1: onNodesChange per auto-persist
// Step 2: Undo/Redo (R3.7-004)
// 004A: Workspace = memoria undo, Canvas = operatore

// ── Undo history type (shared with Workspace) ──
export interface UndoHistory {
    stack: CanvasNode[][]
    cursor: number
}

const HISTORY_MAX = 50

interface TakeCanvasProps {
    takeId: string
    initialNodes?: CanvasNode[]
    onNodesChange?: (nodes: CanvasNode[]) => void
    // ── R3.7-004A: Undo history owned by Workspace ──
    initialUndoHistory?: UndoHistory
    onUndoHistoryChange?: (history: UndoHistory) => void
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

export interface TakeCanvasHandle {
    getSnapshot: () => CanvasNode[]
}

type InteractionMode = 'idle' | 'dragging' | 'editing'

const DRAG_THRESHOLD = 3

export const TakeCanvas = forwardRef<TakeCanvasHandle, TakeCanvasProps>(
    function TakeCanvas({ takeId, initialNodes, onNodesChange, initialUndoHistory, onUndoHistoryChange }, ref) {
        const [nodes, setNodes] = useState<CanvasNode[]>(
            () => initialNodes ?? []
        )
        const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
        const [interactionMode, setInteractionMode] = useState<InteractionMode>('idle')
        const [editingField, setEditingField] = useState<'title' | 'body' | null>(null)

        const canvasRef = useRef<HTMLDivElement>(null)

        const dragRef = useRef<{
            nodeId: string
            startNodeX: number
            startNodeY: number
            startMouseX: number
            startMouseY: number
            hasMoved: boolean
        } | null>(null)

        const nodesRef = useRef<CanvasNode[]>(nodes)
        useEffect(() => {
            nodesRef.current = nodes
        }, [nodes])

        // ── R3.7-004A: History from Workspace or fresh ──
        const historyRef = useRef<UndoHistory>(
            initialUndoHistory
                ? structuredClone(initialUndoHistory)
                : { stack: [structuredClone(initialNodes ?? [])], cursor: 0 }
        )

        // ── emitNodesChange ──
        const emitNodesChange = useCallback(() => {
            if (onNodesChange) {
                onNodesChange(structuredClone(nodesRef.current))
            }
        }, [onNodesChange])

        // ── R3.7-004A: Notify Workspace of history change ──
        const emitHistoryChange = useCallback(() => {
            if (onUndoHistoryChange) {
                onUndoHistoryChange(structuredClone(historyRef.current))
            }
        }, [onUndoHistoryChange])

        // ── pushHistory ──
        const pushHistory = useCallback(() => {
            const current = structuredClone(nodesRef.current)
            const h = historyRef.current

            h.stack = h.stack.slice(0, h.cursor + 1)
            h.stack.push(current)

            if (h.stack.length > HISTORY_MAX) {
                h.stack.shift()
            } else {
                h.cursor++
            }

            emitHistoryChange()
        }, [emitHistoryChange])

        // ── Undo ──
        const undo = useCallback(() => {
            const h = historyRef.current
            if (h.cursor <= 0) return

            h.cursor--
            const prevState = structuredClone(h.stack[h.cursor])
            setNodes(prevState)
            emitHistoryChange()
            setTimeout(() => emitNodesChange(), 0)
        }, [emitNodesChange, emitHistoryChange])

        // ── Redo ──
        const redo = useCallback(() => {
            const h = historyRef.current
            if (h.cursor >= h.stack.length - 1) return

            h.cursor++
            const nextState = structuredClone(h.stack[h.cursor])
            setNodes(nextState)
            emitHistoryChange()
            setTimeout(() => emitNodesChange(), 0)
        }, [emitNodesChange, emitHistoryChange])

        // ── Keyboard shortcuts ──
        useEffect(() => {
            const handleKeyDown = (e: KeyboardEvent) => {
                const mod = e.metaKey || e.ctrlKey
                if (mod && e.key === 'z' && !e.shiftKey) {
                    e.preventDefault()
                    undo()
                }
                if (mod && e.key === 'z' && e.shiftKey) {
                    e.preventDefault()
                    redo()
                }
            }

            window.addEventListener('keydown', handleKeyDown)
            return () => window.removeEventListener('keydown', handleKeyDown)
        }, [undo, redo])

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

            if (dragRef.current?.hasMoved) {
                setInteractionMode('idle')
                pushHistory()
                emitNodesChange()
            }

            dragRef.current = null
        }, [handleWindowMouseMove, pushHistory, emitNodesChange])

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
            setTimeout(() => { pushHistory(); emitNodesChange() }, 0)
        }, [pushHistory, emitNodesChange])

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
            setTimeout(() => { pushHistory(); emitNodesChange() }, 0)
        }, [pushHistory, emitNodesChange])

        // ============================================
        // CANVAS HANDLERS
        // ============================================

        const handleCanvasMouseDown = useCallback(() => {
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
            setTimeout(() => { pushHistory(); emitNodesChange() }, 0)
        }, [nodes.length, pushHistory, emitNodesChange])

        return (
            <div className="flex-1 flex">
                <aside className="w-12 bg-zinc-800 flex flex-col items-center py-2 gap-1 shrink-0">
                    <button
                        onClick={handleCreateNote}
                        className="w-9 h-9 bg-zinc-700 hover:bg-zinc-500 hover:scale-105 rounded flex items-center justify-center cursor-pointer transition-all"
                        title="Add Note"
                    >
                        <span className="text-xs text-zinc-400">Note</span>
                    </button>
                </aside>

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