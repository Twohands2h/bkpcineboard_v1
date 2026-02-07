'use client'

import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react'
import { NodeShell } from './NodeShell'
import { NoteContent, ImageContent, type NoteData, type ImageData } from './NodeContent'

// ===================================================
// TAKE CANVAS — PURE WORK AREA (R4-002)
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

type InteractionMode = 'idle' | 'dragging' | 'editing' | 'resizing' | 'selecting'

const DRAG_THRESHOLD = 3
const MAX_INITIAL_IMAGE_WIDTH = 400
const MAX_INITIAL_IMAGE_HEIGHT = 300

interface SelectionBoxRect {
    left: number
    top: number
    width: number
    height: number
}

export const TakeCanvas = forwardRef<TakeCanvasHandle, TakeCanvasProps>(
    function TakeCanvas({ takeId, initialNodes, onNodesChange, initialUndoHistory, onUndoHistoryChange }, ref) {
        const [nodes, setNodes] = useState<CanvasNode[]>(
            () => initialNodes ?? []
        )
        const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set())
        const [interactionMode, setInteractionMode] = useState<InteractionMode>('idle')
        const [editingField, setEditingField] = useState<'title' | 'body' | null>(null)
        // R4-002: visual selection box (for rendering only)
        const [selectionBoxRect, setSelectionBoxRect] = useState<SelectionBoxRect | null>(null)

        const canvasRef = useRef<HTMLDivElement>(null)

        const dragRef = useRef<{
            nodeId: string
            offsets: Map<string, { startX: number; startY: number }>
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

        // R4-002: selection box ref (source of truth during drag)
        const selBoxRef = useRef<{
            startX: number  // canvas-relative
            startY: number
            canvasRect: DOMRect
        } | null>(null)

        const nodesRef = useRef<CanvasNode[]>(nodes)
        useEffect(() => {
            nodesRef.current = nodes
        }, [nodes])

        const selectedNodeIdsRef = useRef<Set<string>>(selectedNodeIds)
        useEffect(() => {
            selectedNodeIdsRef.current = selectedNodeIds
        }, [selectedNodeIds])

        const primarySelectedId = selectedNodeIds.size === 1
            ? Array.from(selectedNodeIds)[0]
            : null

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
                if (e.key === 'Escape') {
                    setSelectedNodeIds(new Set())
                    setInteractionMode('idle')
                    setEditingField(null)
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
            setSelectedNodeIds(new Set([newNode.id]))
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
            setSelectedNodeIds(new Set([newNode.id]))
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
            setSelectedNodeIds(new Set())
            setInteractionMode('idle')
            setEditingField(null)
            dragRef.current = null
            resizeRef.current = null
            selBoxRef.current = null
            setSelectionBoxRect(null)
        }, [takeId])

        // ============================================
        // DRAG HANDLERS (R4-002: group move)
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
                const offsets = dragRef.current.offsets
                setNodes((prev) =>
                    prev.map((node) => {
                        const offset = offsets.get(node.id)
                        if (!offset) return node
                        return { ...node, x: offset.startX + deltaX, y: offset.startY + deltaY }
                    })
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
        // SELECTION BOX HANDLERS (R4-002)
        // All via refs — no stale closure issues
        // ============================================

        const handleSelBoxMouseMove = useCallback((e: MouseEvent) => {
            const sb = selBoxRef.current
            if (!sb) return
            e.preventDefault()

            const currentX = e.clientX - sb.canvasRect.left
            const currentY = e.clientY - sb.canvasRect.top

            const left = Math.min(sb.startX, currentX)
            const top = Math.min(sb.startY, currentY)
            const width = Math.abs(currentX - sb.startX)
            const height = Math.abs(currentY - sb.startY)

            setSelectionBoxRect({ left, top, width, height })
        }, [])

        const handleSelBoxMouseUp = useCallback(() => {
            window.removeEventListener('mousemove', handleSelBoxMouseMove)
            window.removeEventListener('mouseup', handleSelBoxMouseUp)

            const sb = selBoxRef.current
            if (sb) {
                // Read final rect from DOM state via ref
                // We need to recalculate from the last known mouse position
                // But we can just use the current selectionBoxRect... which is stale.
                // Instead, let's compute selection from what we have:
            }

            // Use a microtask to read the latest selectionBoxRect
            setTimeout(() => {
                // Find nodes inside the box using the ref
                const boxEl = document.querySelector('[data-selection-box]')
                if (boxEl) {
                    const boxRect = boxEl.getBoundingClientRect()
                    const canvasRect = canvasRef.current?.getBoundingClientRect()
                    if (canvasRect && boxRect.width > 2 && boxRect.height > 2) {
                        const left = boxRect.left - canvasRect.left
                        const top = boxRect.top - canvasRect.top
                        const right = left + boxRect.width
                        const bottom = top + boxRect.height

                        const selected = new Set<string>()
                        nodesRef.current.forEach((node) => {
                            const nodeRight = node.x + node.width
                            const nodeBottom = node.y + node.height
                            if (node.x < right && nodeRight > left && node.y < bottom && nodeBottom > top) {
                                selected.add(node.id)
                            }
                        })
                        setSelectedNodeIds(selected)
                    }
                }

                setSelectionBoxRect(null)
                selBoxRef.current = null
                setInteractionMode('idle')
            }, 0)
        }, [handleSelBoxMouseMove])

        useEffect(() => {
            return () => {
                window.removeEventListener('mousemove', handleSelBoxMouseMove)
                window.removeEventListener('mouseup', handleSelBoxMouseUp)
            }
        }, [handleSelBoxMouseMove, handleSelBoxMouseUp])

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
            const aspectRatio = node.type === 'image' ? node.width / node.height : null
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
        // REQUEST HEIGHT
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
            // Se il nodo è già nella multi-selezione, mantienila
            if (selectedNodeIds.has(nodeId) && selectedNodeIds.size > 1) return
            setSelectedNodeIds(new Set([nodeId]))
        }, [selectedNodeIds])

        const handlePotentialDragStart = useCallback(
            (nodeId: string, mouseX: number, mouseY: number) => {
                const currentSelected = selectedNodeIdsRef.current.has(nodeId)
                    ? selectedNodeIdsRef.current
                    : new Set([nodeId])

                const offsets = new Map<string, { startX: number; startY: number }>()
                nodesRef.current.forEach((node) => {
                    if (currentSelected.has(node.id)) {
                        offsets.set(node.id, { startX: node.x, startY: node.y })
                    }
                })

                dragRef.current = {
                    nodeId,
                    offsets,
                    startMouseX: mouseX,
                    startMouseY: mouseY,
                    hasMoved: false,
                }

                if (!selectedNodeIdsRef.current.has(nodeId)) {
                    setSelectedNodeIds(new Set([nodeId]))
                }

                window.addEventListener('mousemove', handleWindowMouseMove)
                window.addEventListener('mouseup', handleWindowMouseUp)
            },
            [handleWindowMouseMove, handleWindowMouseUp]
        )

        const handleDelete = useCallback((nodeId: string) => {
            setNodes((prev) => prev.filter((n) => n.id !== nodeId))
            setSelectedNodeIds(new Set())
            setInteractionMode('idle')
            setEditingField(null)
            setTimeout(() => { pushHistory(); emitNodesChange() }, 0)
        }, [pushHistory, emitNodesChange])

        const handleStartEditing = useCallback((nodeId: string, field: 'title' | 'body') => {
            setSelectedNodeIds(new Set([nodeId]))
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

        // R4-002: Canvas mousedown — start selection box or clear
        const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
            if (interactionMode === 'editing') return

            const rect = canvasRef.current?.getBoundingClientRect()
            if (!rect) return

            const startX = e.clientX - rect.left
            const startY = e.clientY - rect.top

            selBoxRef.current = { startX, startY, canvasRect: rect }
            setSelectionBoxRect({ left: startX, top: startY, width: 0, height: 0 })
            setInteractionMode('selecting')
            setSelectedNodeIds(new Set())
            setEditingField(null)

            window.addEventListener('mousemove', handleSelBoxMouseMove)
            window.addEventListener('mouseup', handleSelBoxMouseUp)
        }, [interactionMode, handleSelBoxMouseMove, handleSelBoxMouseUp])

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
                        isSelected={selectedNodeIds.has(node.id)}
                        isDragging={interactionMode === 'dragging' && dragRef.current?.offsets.has(node.id) === true}
                        interactionMode={interactionMode}
                        onSelect={handleSelect}
                        onPotentialDragStart={handlePotentialDragStart}
                        onDelete={handleDelete}
                        onResizeStart={handleResizeStart}
                    >
                        {node.type === 'note' ? (
                            <NoteContent
                                data={node.data}
                                isEditing={interactionMode === 'editing' && node.id === primarySelectedId}
                                editingField={node.id === primarySelectedId ? editingField : null}
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

                {/* R4-002: Selection box overlay */}
                {selectionBoxRect && selectionBoxRect.width > 2 && selectionBoxRect.height > 2 && (
                    <div
                        data-selection-box
                        className="absolute border border-blue-500 bg-blue-500/10 pointer-events-none z-[9998]"
                        style={{
                            left: selectionBoxRect.left,
                            top: selectionBoxRect.top,
                            width: selectionBoxRect.width,
                            height: selectionBoxRect.height,
                        }}
                    />
                )}

                {nodes.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <p className="text-zinc-600 text-sm">Drag "Note" or "Image" from sidebar to canvas</p>
                    </div>
                )}
            </div>
        )
    })