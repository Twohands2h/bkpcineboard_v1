'use client'

import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react'
import { NodeShell } from './NodeShell'
import { NoteContent, ImageContent, type NoteData, type ImageData } from './NodeContent'

// ===================================================
// TAKE CANVAS — PURE WORK AREA (R4-003)
// ===================================================

export interface UndoHistory {
    stack: CanvasSnapshot[]
    cursor: number
}

// R4-003: Snapshot now includes edges
interface CanvasSnapshot {
    nodes: CanvasNode[]
    edges: CanvasEdge[]
}

const HISTORY_MAX = 50
const MIN_WIDTH = 120
const MIN_HEIGHT = 80
const MIN_IMAGE_SIZE = 32

interface TakeCanvasProps {
    takeId: string
    initialNodes?: CanvasNode[]
    initialEdges?: CanvasEdge[]
    onNodesChange?: (nodes: CanvasNode[], edges: CanvasEdge[]) => void
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

// R4-003: Edge type
export interface CanvasEdge {
    id: string
    from: string
    to: string
    label?: string
}

export interface TakeCanvasHandle {
    getSnapshot: () => { nodes: CanvasNode[]; edges: CanvasEdge[] }
    createNodeAt: (x: number, y: number) => void
    createImageNodeAt: (x: number, y: number, imageData: ImageData) => void
    getCanvasRect: () => DOMRect | null
}

type InteractionMode = 'idle' | 'dragging' | 'editing' | 'resizing' | 'selecting' | 'connecting'

const DRAG_THRESHOLD = 3
const MAX_INITIAL_IMAGE_WIDTH = 400
const MAX_INITIAL_IMAGE_HEIGHT = 300
const EDGE_HIT_DISTANCE = 8

// Helper: get center of a node
function nodeCenter(node: CanvasNode): { x: number; y: number } {
    return { x: node.x + node.width / 2, y: node.y + node.height / 2 }
}

// Helper: get edge anchor point on node border (from center toward target)
function edgeAnchor(node: CanvasNode, targetX: number, targetY: number): { x: number; y: number } {
    const cx = node.x + node.width / 2
    const cy = node.y + node.height / 2
    const dx = targetX - cx
    const dy = targetY - cy

    if (dx === 0 && dy === 0) return { x: cx, y: cy }

    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)
    const hw = node.width / 2
    const hh = node.height / 2

    let scale: number
    if (absDx / hw > absDy / hh) {
        scale = hw / absDx
    } else {
        scale = hh / absDy
    }

    return { x: cx + dx * scale, y: cy + dy * scale }
}

// Helper: distance from point to line segment
function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1
    const dy = y2 - y1
    const lenSq = dx * dx + dy * dy
    if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2)
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq
    t = Math.max(0, Math.min(1, t))
    const projX = x1 + t * dx
    const projY = y1 + t * dy
    return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2)
}

interface SelectionBoxRect {
    left: number
    top: number
    width: number
    height: number
}

export const TakeCanvas = forwardRef<TakeCanvasHandle, TakeCanvasProps>(
    function TakeCanvas({ takeId, initialNodes, initialEdges, onNodesChange, initialUndoHistory, onUndoHistoryChange }, ref) {
        const [nodes, setNodes] = useState<CanvasNode[]>(() => initialNodes ?? [])
        const [edges, setEdges] = useState<CanvasEdge[]>(() => initialEdges ?? [])
        const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set())
        const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
        const [editingEdgeLabel, setEditingEdgeLabel] = useState<string | null>(null)
        const [interactionMode, setInteractionMode] = useState<InteractionMode>('idle')
        const [editingField, setEditingField] = useState<'title' | 'body' | null>(null)
        const [selectionBoxRect, setSelectionBoxRect] = useState<SelectionBoxRect | null>(null)

        // R4-003: ghost connection line
        const [connectionGhost, setConnectionGhost] = useState<{
            fromX: number; fromY: number; toX: number; toY: number
        } | null>(null)

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

        const selBoxRef = useRef<{
            startX: number
            startY: number
            canvasRect: DOMRect
        } | null>(null)

        // R4-003: connection drag ref
        const connectionRef = useRef<{
            fromNodeId: string
            startX: number
            startY: number
            canvasRect: DOMRect
        } | null>(null)

        const nodesRef = useRef<CanvasNode[]>(nodes)
        useEffect(() => { nodesRef.current = nodes }, [nodes])

        const edgesRef = useRef<CanvasEdge[]>(edges)
        useEffect(() => { edgesRef.current = edges }, [edges])

        const selectedNodeIdsRef = useRef<Set<string>>(selectedNodeIds)
        useEffect(() => { selectedNodeIdsRef.current = selectedNodeIds }, [selectedNodeIds])

        const primarySelectedId = selectedNodeIds.size === 1
            ? Array.from(selectedNodeIds)[0]
            : null

        // ── History (R4-003: includes edges) ──
        const historyRef = useRef<UndoHistory>(
            initialUndoHistory
                ? structuredClone(initialUndoHistory)
                : { stack: [{ nodes: structuredClone(initialNodes ?? []), edges: structuredClone(initialEdges ?? []) }], cursor: 0 }
        )

        const emitNodesChange = useCallback(() => {
            if (onNodesChange) {
                onNodesChange(structuredClone(nodesRef.current), structuredClone(edgesRef.current))
            }
        }, [onNodesChange])

        const emitHistoryChange = useCallback(() => {
            if (onUndoHistoryChange) {
                onUndoHistoryChange(structuredClone(historyRef.current))
            }
        }, [onUndoHistoryChange])

        const pushHistory = useCallback(() => {
            const current: CanvasSnapshot = {
                nodes: structuredClone(nodesRef.current),
                edges: structuredClone(edgesRef.current),
            }
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
            const prev = structuredClone(h.stack[h.cursor])
            setNodes(prev.nodes)
            setEdges(prev.edges)
            emitHistoryChange()
            setTimeout(() => emitNodesChange(), 0)
        }, [emitNodesChange, emitHistoryChange])

        const redo = useCallback(() => {
            const h = historyRef.current
            if (h.cursor >= h.stack.length - 1) return
            h.cursor++
            const next = structuredClone(h.stack[h.cursor])
            setNodes(next.nodes)
            setEdges(next.edges)
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
                    setSelectedEdgeId(null)
                    setEditingEdgeLabel(null)
                    setInteractionMode('idle')
                    setEditingField(null)
                }
                // R4-002 addendum: Delete/Backspace deletes selected nodes
                if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeIdsRef.current.size > 0 && interactionMode === 'idle') {
                    const active = document.activeElement
                    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return
                    e.preventDefault()
                    const toDelete = selectedNodeIdsRef.current
                    setNodes(prev => prev.filter(n => !toDelete.has(n.id)))
                    setEdges(prev => prev.filter(ed => !toDelete.has(ed.from) && !toDelete.has(ed.to)))
                    setSelectedNodeIds(new Set())
                    setSelectedEdgeId(null)
                    setEditingEdgeLabel(null)
                    setInteractionMode('idle')
                    setEditingField(null)
                    setTimeout(() => { pushHistory(); emitNodesChange() }, 0)
                }
            }
            window.addEventListener('keydown', handleKeyDown)
            return () => window.removeEventListener('keydown', handleKeyDown)
        }, [undo, redo, selectedEdgeId, interactionMode, pushHistory, emitNodesChange])

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
            setSelectedEdgeId(null)
            setEditingEdgeLabel(null)
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
            setSelectedEdgeId(null)
            setEditingEdgeLabel(null)
            setInteractionMode('idle')
            setTimeout(() => { pushHistory(); emitNodesChange() }, 0)
        }, [pushHistory, emitNodesChange])

        useImperativeHandle(ref, () => ({
            getSnapshot: () => ({
                nodes: structuredClone(nodes),
                edges: structuredClone(edges),
            }),
            createNodeAt,
            createImageNodeAt,
            getCanvasRect: () => canvasRef.current?.getBoundingClientRect() ?? null,
        }), [nodes, edges, createNodeAt, createImageNodeAt])

        useEffect(() => {
            setSelectedNodeIds(new Set())
            setSelectedEdgeId(null)
            setEditingEdgeLabel(null)
            setInteractionMode('idle')
            setEditingField(null)
            dragRef.current = null
            resizeRef.current = null
            selBoxRef.current = null
            connectionRef.current = null
            setSelectionBoxRect(null)
            setConnectionGhost(null)
        }, [takeId])

        // ============================================
        // DRAG HANDLERS (group move)
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
        // SELECTION BOX HANDLERS
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

            setTimeout(() => {
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
        // CONNECTION HANDLERS (R4-003)
        // ============================================

        const handleConnectionMouseMove = useCallback((e: MouseEvent) => {
            const conn = connectionRef.current
            if (!conn) return
            e.preventDefault()

            const fromNode = nodesRef.current.find(n => n.id === conn.fromNodeId)
            if (!fromNode) return

            const toX = e.clientX - conn.canvasRect.left
            const toY = e.clientY - conn.canvasRect.top
            const from = edgeAnchor(fromNode, toX, toY)

            setConnectionGhost({ fromX: from.x, fromY: from.y, toX: toX, toY: toY })
        }, [])

        const handleConnectionMouseUp = useCallback((e: MouseEvent) => {
            window.removeEventListener('mousemove', handleConnectionMouseMove)
            window.removeEventListener('mouseup', handleConnectionMouseUp)

            const conn = connectionRef.current
            if (conn) {
                const canvasRect = conn.canvasRect
                const mouseX = e.clientX - canvasRect.left
                const mouseY = e.clientY - canvasRect.top

                // Find target node under mouse
                const targetNode = nodesRef.current.find(node => {
                    if (node.id === conn.fromNodeId) return false
                    return mouseX >= node.x && mouseX <= node.x + node.width &&
                        mouseY >= node.y && mouseY <= node.y + node.height
                })

                if (targetNode) {
                    // Check for duplicate edge
                    const duplicate = edgesRef.current.some(
                        e => (e.from === conn.fromNodeId && e.to === targetNode.id) ||
                            (e.from === targetNode.id && e.to === conn.fromNodeId)
                    )

                    if (!duplicate) {
                        const newEdge: CanvasEdge = {
                            id: crypto.randomUUID(),
                            from: conn.fromNodeId,
                            to: targetNode.id,
                        }
                        setEdges(prev => [...prev, newEdge])
                        setTimeout(() => { pushHistory(); emitNodesChange() }, 0)
                    }
                }
            }

            connectionRef.current = null
            setConnectionGhost(null)
            setInteractionMode('idle')
        }, [handleConnectionMouseMove, pushHistory, emitNodesChange])

        const handleConnectionStart = useCallback((nodeId: string, mouseX: number, mouseY: number) => {
            const canvasRect = canvasRef.current?.getBoundingClientRect()
            if (!canvasRect) return

            connectionRef.current = {
                fromNodeId: nodeId,
                startX: mouseX - canvasRect.left,
                startY: mouseY - canvasRect.top,
                canvasRect,
            }

            setInteractionMode('connecting')
            setSelectedEdgeId(null)
            setEditingEdgeLabel(null)

            window.addEventListener('mousemove', handleConnectionMouseMove)
            window.addEventListener('mouseup', handleConnectionMouseUp)
        }, [handleConnectionMouseMove, handleConnectionMouseUp])

        useEffect(() => {
            return () => {
                window.removeEventListener('mousemove', handleConnectionMouseMove)
                window.removeEventListener('mouseup', handleConnectionMouseUp)
            }
        }, [handleConnectionMouseMove, handleConnectionMouseUp])

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
            if (selectedNodeIdsRef.current.has(nodeId) && selectedNodeIdsRef.current.size > 1) return
            setSelectedNodeIds(new Set([nodeId]))
            setSelectedEdgeId(null)
            setEditingEdgeLabel(null)
        }, [])

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
            // R4-003: also remove edges connected to deleted node
            setEdges((prev) => prev.filter((e) => e.from !== nodeId && e.to !== nodeId))
            setSelectedNodeIds(new Set())
            setSelectedEdgeId(null)
            setEditingEdgeLabel(null)
            setInteractionMode('idle')
            setEditingField(null)
            setTimeout(() => { pushHistory(); emitNodesChange() }, 0)
        }, [pushHistory, emitNodesChange])

        const handleStartEditing = useCallback((nodeId: string, field: 'title' | 'body') => {
            setSelectedNodeIds(new Set([nodeId]))
            setSelectedEdgeId(null)
            setEditingEdgeLabel(null)
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

        // R4-003: Click on SVG layer to select/deselect edges
        const handleSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
            const canvasRect = canvasRef.current?.getBoundingClientRect()
            if (!canvasRect) return

            const mouseX = e.clientX - canvasRect.left
            const mouseY = e.clientY - canvasRect.top

            // Find closest edge
            let closestEdge: CanvasEdge | null = null
            let closestDist = EDGE_HIT_DISTANCE

            edgesRef.current.forEach((edge) => {
                const fromNode = nodesRef.current.find(n => n.id === edge.from)
                const toNode = nodesRef.current.find(n => n.id === edge.to)
                if (!fromNode || !toNode) return

                const fromCenter = nodeCenter(fromNode)
                const toCenter = nodeCenter(toNode)
                const from = edgeAnchor(fromNode, toCenter.x, toCenter.y)
                const to = edgeAnchor(toNode, fromCenter.x, fromCenter.y)

                const dist = distToSegment(mouseX, mouseY, from.x, from.y, to.x, to.y)
                if (dist < closestDist) {
                    closestDist = dist
                    closestEdge = edge
                }
            })

            if (closestEdge) {
                e.stopPropagation()
                setSelectedEdgeId(closestEdge.id)
                setEditingEdgeLabel(null)
                setSelectedNodeIds(new Set())
            }
        }, [])

        // Canvas mousedown — start selection box or clear
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
            setSelectedEdgeId(null)
            setEditingEdgeLabel(null)
            setEditingField(null)

            window.addEventListener('mousemove', handleSelBoxMouseMove)
            window.addEventListener('mouseup', handleSelBoxMouseUp)
        }, [interactionMode, handleSelBoxMouseMove, handleSelBoxMouseUp])

        // ── Compute edge lines for rendering ──
        const edgeLines = edges.map((edge) => {
            const fromNode = nodes.find(n => n.id === edge.from)
            const toNode = nodes.find(n => n.id === edge.to)
            if (!fromNode || !toNode) return null

            const fromCenter = nodeCenter(fromNode)
            const toCenter = nodeCenter(toNode)
            const from = edgeAnchor(fromNode, toCenter.x, toCenter.y)
            const to = edgeAnchor(toNode, fromCenter.x, fromCenter.y)

            return { edge, from, to }
        }).filter(Boolean) as { edge: CanvasEdge; from: { x: number; y: number }; to: { x: number; y: number } }[]

        return (
            <div
                ref={canvasRef}
                className="flex-1 bg-zinc-950 relative overflow-hidden"
                onMouseDown={handleCanvasMouseDown}
            >
                {/* R4-003: SVG edge layer — UNDER nodes */}
                <svg
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    style={{ zIndex: 0 }}
                >
                    <defs>
                        <marker
                            id="arrowhead"
                            markerWidth="8"
                            markerHeight="6"
                            refX="7"
                            refY="3"
                            orient="auto"
                        >
                            <polygon points="0 0, 8 3, 0 6" fill="#71717a" />
                        </marker>
                        <marker
                            id="arrowhead-selected"
                            markerWidth="8"
                            markerHeight="6"
                            refX="7"
                            refY="3"
                            orient="auto"
                        >
                            <polygon points="0 0, 8 3, 0 6" fill="#3b82f6" />
                        </marker>
                    </defs>

                    {/* Clickable hit areas (pointer-events enabled) */}
                    <g style={{ pointerEvents: 'stroke' }} onClick={handleSvgClick as any}>
                        {edgeLines.map(({ edge, from, to }) => (
                            <line
                                key={`hit-${edge.id}`}
                                x1={from.x} y1={from.y}
                                x2={to.x} y2={to.y}
                                stroke="transparent"
                                strokeWidth={EDGE_HIT_DISTANCE * 2}
                                style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                            />
                        ))}
                    </g>

                    {/* Visible edges */}
                    {edgeLines.map(({ edge, from, to }) => {
                        const isSelected = edge.id === selectedEdgeId
                        return (
                            <line
                                key={edge.id}
                                x1={from.x} y1={from.y}
                                x2={to.x} y2={to.y}
                                stroke={isSelected ? '#3b82f6' : '#71717a'}
                                strokeWidth={isSelected ? 2 : 1.5}
                                markerEnd={isSelected ? 'url(#arrowhead-selected)' : 'url(#arrowhead)'}
                            />
                        )
                    })}

                    {/* Ghost connection line */}
                    {connectionGhost && (
                        <line
                            x1={connectionGhost.fromX} y1={connectionGhost.fromY}
                            x2={connectionGhost.toX} y2={connectionGhost.toY}
                            stroke="#10b981"
                            strokeWidth={2}
                            strokeDasharray="6 3"
                            markerEnd="url(#arrowhead)"
                        />
                    )}
                </svg>

                {/* R4-003: Edge labels — between SVG and nodes */}
                {edgeLines.map(({ edge, from, to }) => {
                    const isSelected = edge.id === selectedEdgeId
                    if (!isSelected && !edge.label) return null

                    const midX = (from.x + to.x) / 2
                    const midY = (from.y + to.y) / 2

                    return (
                        <div
                            key={`label-${edge.id}`}
                            className="absolute pointer-events-auto z-[5]"
                            style={{
                                left: midX,
                                top: midY,
                                transform: 'translate(-50%, -50%)',
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {isSelected ? (
                                <input
                                    type="text"
                                    autoFocus={editingEdgeLabel === edge.id}
                                    placeholder="label..."
                                    defaultValue={edge.label || ''}
                                    onFocus={() => setEditingEdgeLabel(edge.id)}
                                    onBlur={(ev) => {
                                        const value = ev.target.value.trim()
                                        setEdges(prev => prev.map(ed =>
                                            ed.id === edge.id ? { ...ed, label: value || undefined } : ed
                                        ))
                                        setEditingEdgeLabel(null)
                                        setTimeout(() => { pushHistory(); emitNodesChange() }, 0)
                                    }}
                                    onKeyDown={(ev) => {
                                        if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur()
                                        if (ev.key === 'Escape') {
                                            (ev.target as HTMLInputElement).value = edge.label || ''
                                                ; (ev.target as HTMLInputElement).blur()
                                        }
                                        ev.stopPropagation()
                                    }}
                                    className="bg-zinc-800 border border-blue-500 text-zinc-200 text-[10px] px-1.5 py-0.5 outline-none text-center min-w-[60px] max-w-[120px]"
                                />
                            ) : (
                                <span className="text-[10px] text-zinc-500 bg-zinc-900/80 px-1 py-0.5">
                                    {edge.label}
                                </span>
                            )}
                        </div>
                    )
                })}

                {/* Nodes layer — ABOVE edges */}
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
                        onConnectionStart={handleConnectionStart}
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

                {/* Selection box overlay */}
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

                {nodes.length === 0 && edges.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <p className="text-zinc-600 text-sm">Drag "Note" or "Image" from sidebar to canvas</p>
                    </div>
                )}
            </div>
        )
    })