'use client'

import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react'
import { NodeShell } from './NodeShell'
import { NoteContent, ImageContent, type NoteData, type ImageData } from './NodeContent'

// ===================================================
// TAKE CANVAS — PURE WORK AREA (R4-001b)
// ===================================================

export interface UndoHistory {
    stack: CanvasNode[][]
    cursor: number
}

const HISTORY_MAX = 50
const MIN_WIDTH = 120
const MIN_HEIGHT = 80
const MIN_IMAGE_SIZE = 32

interface TakeCanvasProps {
    takeId: string
    initialNodes?: CanvasNode[]
    onNodesChange?: (nodes: CanvasNode[]) => void
    initialUndoHistory?: UndoHistory
    onUndoHistoryChange?: (history: UndoHistory) => void
}

export type CanvasNode = NoteNode | ImageNode

interface NoteNode {
    id: string
    type: 'note'
    x: number
    y: number
    width: number
    height: number
    zIndex: number
    data: NoteData
}

interface ImageNode {
    id: string
    type: 'image'
    x: number
    y: number
    width: number
    height: number
    zIndex: number
    data: ImageData
}

export interface TakeCanvasHandle {
    getSnapshot: () => CanvasNode[]
    createNodeAt: (x: number, y: number) => void
    createImageNodeAt: (x: number, y: number, imageData: ImageData) => void
    getCanvasRect: () => DOMRect | null
}

type InteractionMode = 'idle' | 'dragging' | 'editing' | 'resizing'

const DRAG_THRESHOLD = 3
const MAX_INITIAL_IMAGE_WIDTH = 400
const MAX_INITIAL_IMAGE_HEIGHT = 300

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

        const resizeRef = useRef<{
            nodeId: string
            startWidth: number
            startHeight: number
            startMouseX: number
            startMouseY: number
            aspectRatio: number | null
        } | null>(null)

        const nodesRef = useRef<CanvasNode[]>(nodes)
        useEffect(() => {
            nodesRef.current = nodes
        }, [nodes])

        // ── History ──
        const historyRef = useRef<UndoHistory>(
            initialUndoHistory
                ? structuredClone(initialUndoHistory)
                : { stack: [structuredClone(initialNodes ?? [])], cursor: 0 }
        )

        const emitNodesChange = useCallback(() => {
            if (onNodesChange) {
                onNodesChange(structuredClone(nodesRef.current))
            }
        }, [onNodesChange])

        const emitHistoryChange = useCallback(() => {
            if (onUndoHistoryChange) {
                onUndoHistoryChange(structuredClone(historyRef.current))
            }
        }, [onUndoHistoryChange])

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

        const undo = useCallback(() => {
            const h = historyRef.current
            if (h.cursor <= 0) return

            h.cursor--
            const prevState = structuredClone(h.stack[h.cursor])
            setNodes(prevState)
            emitHistoryChange()
            setTimeout(() => emitNodesChange(), 0)
        }, [emitNodesChange, emitHistoryChange])

        const redo = useCallback(() => {
            const h = historyRef.current
            if (h.cursor >= h.stack.length - 1) return

            h.cursor++
            const nextState = structuredClone(h.stack[h.cursor])
            setNodes(nextState)
            emitHistoryChange()
            setTimeout(() => emitNodesChange(), 0)
        }, [emitNodesChange, emitHistoryChange])

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

        // ── Create note node ──
        const createNodeAt = useCallback((x: number, y: number) => {
            const newNode: NoteNode = {
                id: crypto.randomUUID(),
                type: 'note',
                x: Math.round(x - 100),
                y: Math.round(y - 60),
                width: 200,
                height: 120,
                zIndex: nodesRef.current.length + 1,
                data: {},
            }

            setNodes((prev) => [...prev, newNode])
            setSelectedNodeId(newNode.id)
            setInteractionMode('idle')
            setTimeout(() => { pushHistory(); emitNodesChange() }, 0)
        }, [pushHistory, emitNodesChange])

        // ── Create image node ──
        const createImageNodeAt = useCallback((x: number, y: number, imageData: ImageData) => {
            const { naturalWidth, naturalHeight } = imageData
            const ratio = naturalWidth / naturalHeight
            let w: number, h: number

            if (naturalWidth > MAX_INITIAL_IMAGE_WIDTH || naturalHeight > MAX_INITIAL_IMAGE_HEIGHT) {
                if (ratio > MAX_INITIAL_IMAGE_WIDTH / MAX_INITIAL_IMAGE_HEIGHT) {
                    w = MAX_INITIAL_IMAGE_WIDTH
                    h = w / ratio
                } else {
                    h = MAX_INITIAL_IMAGE_HEIGHT
                    w = h * ratio
                }
            } else {
                w = naturalWidth
                h = naturalHeight
            }

            const newNode: ImageNode = {
                id: crypto.randomUUID(),
                type: 'image',
                x: Math.round(x - w / 2),
                y: Math.round(y - h / 2),
                width: Math.round(w),
                height: Math.round(h),
                zIndex: nodesRef.current.length + 1,
                data: imageData,
            }

            setNodes((prev) => [...prev, newNode])
            setSelectedNodeId(newNode.id)
            setInteractionMode('idle')
            setTimeout(() => { pushHistory(); emitNodesChange() }, 0)
        }, [pushHistory, emitNodesChange])

        useImperativeHandle(ref, () => ({
            getSnapshot: () => structuredClone(nodes),
            createNodeAt,
            createImageNodeAt,
            getCanvasRect: () => canvasRef.current?.getBoundingClientRect() ?? null,
        }), [nodes, createNodeAt, createImageNodeAt])

        useEffect(() => {
            setSelectedNodeId(null)
            setInteractionMode('idle')
            setEditingField(null)
            dragRef.current = null
            resizeRef.current = null
        }, [takeId])

        // ============================================
        // DRAG HANDLERS
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
        // RESIZE HANDLERS
        // ============================================

        const handleResizeMouseMove = useCallback((e: MouseEvent) => {
            if (!resizeRef.current) return
            e.preventDefault()

            const deltaX = e.clientX - resizeRef.current.startMouseX
            const deltaY = e.clientY - resizeRef.current.startMouseY

            let newWidth: number
            let newHeight: number

            if (resizeRef.current.aspectRatio !== null) {
                newWidth = Math.max(MIN_IMAGE_SIZE, resizeRef.current.startWidth + deltaX)
                newHeight = newWidth / resizeRef.current.aspectRatio
                if (newHeight < MIN_IMAGE_SIZE) {
                    newHeight = MIN_IMAGE_SIZE
                    newWidth = newHeight * resizeRef.current.aspectRatio
                }
            } else {
                newWidth = Math.max(MIN_WIDTH, resizeRef.current.startWidth + deltaX)
                newHeight = Math.max(MIN_HEIGHT, resizeRef.current.startHeight + deltaY)
            }

            setNodes((prev) =>
                prev.map((node) =>
                    node.id === resizeRef.current!.nodeId
                        ? { ...node, width: Math.round(newWidth), height: Math.round(newHeight) }
                        : node
                )
            )
        }, [])

        const handleResizeMouseUp = useCallback(() => {
            window.removeEventListener('mousemove', handleResizeMouseMove)
            window.removeEventListener('mouseup', handleResizeMouseUp)

            if (resizeRef.current) {
                setInteractionMode('idle')
                pushHistory()
                emitNodesChange()
            }

            resizeRef.current = null
        }, [handleResizeMouseMove, pushHistory, emitNodesChange])

        const handleResizeStart = useCallback((nodeId: string, mouseX: number, mouseY: number) => {
            const node = nodesRef.current.find((n) => n.id === nodeId)
            if (!node) return

            const aspectRatio = node.type === 'image'
                ? node.width / node.height
                : null

            resizeRef.current = {
                nodeId,
                startWidth: node.width,
                startHeight: node.height,
                startMouseX: mouseX,
                startMouseY: mouseY,
                aspectRatio,
            }

            setInteractionMode('resizing')

            window.addEventListener('mousemove', handleResizeMouseMove)
            window.addEventListener('mouseup', handleResizeMouseUp)
        }, [handleResizeMouseMove, handleResizeMouseUp])

        useEffect(() => {
            return () => {
                window.removeEventListener('mousemove', handleResizeMouseMove)
                window.removeEventListener('mouseup', handleResizeMouseUp)
            }
        }, [handleResizeMouseMove, handleResizeMouseUp])

        // ============================================
        // REQUEST HEIGHT (from NoteContent auto-grow)
        // ============================================

        const handleRequestHeight = useCallback((nodeId: string, requestedHeight: number) => {
            setNodes((prev) =>
                prev.map((node) =>
                    node.id === nodeId && requestedHeight > node.height
                        ? { ...node, height: requestedHeight }
                        : node
                )
            )
            emitNodesChange()
        }, [emitNodesChange])

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

        const handleCanvasMouseDown = useCallback(() => {
            if (interactionMode !== 'editing') {
                setSelectedNodeId(null)
                setInteractionMode('idle')
                setEditingField(null)
            }
        }, [interactionMode])

        return (
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
                        onResizeStart={handleResizeStart}
                    >
                        {node.type === 'note' ? (
                            <NoteContent
                                data={node.data}
                                isEditing={interactionMode === 'editing' && node.id === selectedNodeId}
                                editingField={node.id === selectedNodeId ? editingField : null}
                                onDataChange={(data) => handleDataChange(node.id, data)}
                                onFieldFocus={handleFieldFocus}
                                onFieldBlur={handleFieldBlur}
                                onStartEditing={(field) => handleStartEditing(node.id, field)}
                                onRequestHeight={(h) => handleRequestHeight(node.id, h)}
                            />
                        ) : (
                            <ImageContent data={node.data} />
                        )}
                    </NodeShell>
                ))}

                {nodes.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <p className="text-zinc-600 text-sm">Drag "Note" or "Image" from sidebar to canvas</p>
                    </div>
                )}
            </div>
        )
    })