'use client'

import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle, useMemo } from 'react'
import { NodeShell } from './NodeShell'
import { NoteContent, ImageContent, ColumnContent, type NoteData, type ImageData, type ColumnData } from './NodeContent'

// ===================================================
// TAKE CANVAS — PURE WORK AREA (R4-004b v7-fixed)
// ===================================================
// Text height in column: measured by DOM (onContentMeasured), not estimated

export interface UndoHistory { stack: CanvasSnapshot[]; cursor: number }
interface CanvasSnapshot { nodes: CanvasNode[]; edges: CanvasEdge[] }

const HISTORY_MAX = 50
const MIN_WIDTH = 120
const MIN_HEIGHT = 80
const MIN_IMAGE_SIZE = 32
const COLUMN_COLLAPSED_HEIGHT = 32
const COLUMN_DEFAULT_WIDTH = 240
const COLUMN_DEFAULT_HEIGHT = 300
const COLUMN_HEADER_HEIGHT = 36
const COLUMN_PADDING = 4
const CHILD_GAP = 4
const COLUMN_MIN_BODY_HEIGHT = 60

interface TakeCanvasProps {
    takeId: string
    initialNodes?: CanvasNode[]
    initialEdges?: CanvasEdge[]
    onNodesChange?: (nodes: CanvasNode[], edges: CanvasEdge[]) => void
    initialUndoHistory?: UndoHistory
    onUndoHistoryChange?: (history: UndoHistory) => void
}

export type CanvasNode = NoteNode | ImageNode | ColumnNode

interface NoteNode { id: string; type: 'note'; x: number; y: number; width: number; height: number; zIndex: number; data: NoteData & { parentId?: string | null } }
interface ImageNode { id: string; type: 'image'; x: number; y: number; width: number; height: number; zIndex: number; data: ImageData & { parentId?: string | null } }
interface ColumnNode { id: string; type: 'column'; x: number; y: number; width: number; height: number; zIndex: number; data: ColumnData & { expandedHeight?: number; childOrder?: string[] } }

export interface CanvasEdge { id: string; from: string; to: string; label?: string }

export interface TakeCanvasHandle {
    getSnapshot: () => { nodes: CanvasNode[]; edges: CanvasEdge[] }
    createNodeAt: (x: number, y: number) => void
    createImageNodeAt: (x: number, y: number, imageData: ImageData) => void
    createColumnNodeAt: (x: number, y: number) => void
    getCanvasRect: () => DOMRect | null
}

type InteractionMode = 'idle' | 'dragging' | 'editing' | 'resizing' | 'selecting' | 'connecting'

const DRAG_THRESHOLD = 3
const MAX_INITIAL_IMAGE_WIDTH = 400
const MAX_INITIAL_IMAGE_HEIGHT = 300
const EDGE_HIT_DISTANCE = 8

interface Rect { x: number; y: number; width: number; height: number }
function rectCenter(r: Rect) { return { x: r.x + r.width / 2, y: r.y + r.height / 2 } }
function edgeAnchor(r: Rect, tx: number, ty: number) {
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2, dx = tx - cx, dy = ty - cy
    if (dx === 0 && dy === 0) return { x: cx, y: cy }
    const s = Math.abs(dx) / (r.width / 2) > Math.abs(dy) / (r.height / 2) ? (r.width / 2) / Math.abs(dx) : (r.height / 2) / Math.abs(dy)
    return { x: cx + dx * s, y: cy + dy * s }
}
function distToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
    const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy
    if (l2 === 0) return Math.hypot(px - x1, py - y1)
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2))
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}
function insideColBodyRect(colRect: Rect, px: number, py: number) {
    return px >= colRect.x && px <= colRect.x + colRect.width && py >= colRect.y + COLUMN_HEADER_HEIGHT && py <= colRect.y + colRect.height
}
function nodeHidden(node: CanvasNode, all: CanvasNode[]) {
    if (node.type === 'column') return false
    const pid = (node.data as any).parentId; if (!pid) return false
    const p = all.find(n => n.id === pid)
    return p?.type === 'column' && !!(p.data as ColumnData).collapsed
}

// ── Derived layout ──
function computeRenderRects(nodes: CanvasNode[], frozenColumnId: string | null, frozenRects: Map<string, Rect> | null): Map<string, Rect> {
    const rects = new Map<string, Rect>()

    // Pass 1: free nodes AND columns (columns get initial rect, pass 2 overrides height)
    for (const n of nodes) {
        if (!(n.data as any).parentId || n.type === 'column')
            rects.set(n.id, { x: n.x, y: n.y, width: n.width, height: n.height })
    }

    // Pass 2: columns — height ALWAYS derived from content
    for (const n of nodes) {
        if (n.type !== 'column') continue
        const col = n as ColumnNode

        // Collapsed: fixed height
        if (col.data.collapsed) {
            rects.set(col.id, { x: col.x, y: col.y, width: col.width, height: COLUMN_COLLAPSED_HEIGHT })
            continue
        }

        // Frozen: use snapshot for children AND column
        if (col.id === frozenColumnId && frozenRects) {
            const children = nodes.filter(c => c.type !== 'column' && (c.data as any).parentId === col.id)
            for (const child of children) { const fr = frozenRects.get(child.id); if (fr) rects.set(child.id, fr) }
            const fcr = frozenRects.get(col.id)
            if (fcr) rects.set(col.id, { ...fcr, width: col.width }) // width may have changed via resize
            continue
        }

        // Layout children
        const order = col.data.childOrder || []
        const children = nodes.filter(c => c.type !== 'column' && (c.data as any).parentId === col.id)
        children.sort((a, b) => {
            const ai = order.indexOf(a.id), bi = order.indexOf(b.id)
            if (ai !== -1 && bi !== -1) return ai - bi
            if (ai !== -1) return -1; if (bi !== -1) return 1; return 0
        })

        const iw = col.width - COLUMN_PADDING * 2
        let cy = col.y + COLUMN_HEADER_HEIGHT + COLUMN_PADDING

        for (const child of children) {
            let h = child.height
            if (child.type === 'image') {
                const d = child.data as ImageData
                h = Math.round(iw / (d.naturalWidth / d.naturalHeight))
            }
            rects.set(child.id, { x: col.x + COLUMN_PADDING, y: cy, width: iw, height: h })
            cy += h + CHILD_GAP
        }

        // Column height = derived from content, never from state
        // Empty column gets minimum body height for usable drop zone
        const minHeight = COLUMN_HEADER_HEIGHT + COLUMN_MIN_BODY_HEIGHT + COLUMN_PADDING * 2
        const contentBottom = children.length > 0
            ? cy - CHILD_GAP + COLUMN_PADDING
            : col.y + minHeight
        const derivedHeight = Math.max(minHeight, contentBottom - col.y)
        rects.set(col.id, { x: col.x, y: col.y, width: col.width, height: derivedHeight })
    }
    return rects
}

function getInsertionIndex(nodes: CanvasNode[], rects: Map<string, Rect>, columnId: string, dropY: number, excludeNodeId: string): number {
    const col = nodes.find(n => n.id === columnId) as ColumnNode | undefined
    if (!col) return 0
    const order = (col.data.childOrder || []).filter(id => id !== excludeNodeId)
    for (let i = 0; i < order.length; i++) {
        const childRect = rects.get(order[i])
        if (childRect && dropY < childRect.y + childRect.height / 2) return i
    }
    return order.length
}

interface SelectionBoxRect { left: number; top: number; width: number; height: number }
interface DetachingState { nodeId: string; frozenRect: Rect; originalParentId: string }

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
        const [connectionGhost, setConnectionGhost] = useState<{ fromX: number; fromY: number; toX: number; toY: number } | null>(null)

        const detachingRef = useRef<DetachingState | null>(null)
        const detachingOffsetRef = useRef<{ dx: number; dy: number } | null>(null)
        const [detachingOffsetState, setDetachingOffsetState] = useState<{ dx: number; dy: number } | null>(null)
        const [frozenColumnId, setFrozenColumnId] = useState<string | null>(null)
        const frozenRectsRef = useRef<Map<string, Rect> | null>(null)

        const canvasRef = useRef<HTMLDivElement>(null)
        const dragRef = useRef<{ nodeId: string; offsets: Map<string, { startX: number; startY: number }>; startMouseX: number; startMouseY: number; hasMoved: boolean } | null>(null)
        const resizeRef = useRef<{ nodeId: string; startWidth: number; startHeight: number; startMouseX: number; startMouseY: number; aspectRatio: number | null } | null>(null)
        const selBoxRef = useRef<{ startX: number; startY: number; canvasRect: DOMRect } | null>(null)
        const connectionRef = useRef<{ fromNodeId: string; startX: number; startY: number; canvasRect: DOMRect } | null>(null)

        const nodesRef = useRef<CanvasNode[]>(nodes); useEffect(() => { nodesRef.current = nodes }, [nodes])
        const edgesRef = useRef<CanvasEdge[]>(edges); useEffect(() => { edgesRef.current = edges }, [edges])
        const selectedNodeIdsRef = useRef<Set<string>>(selectedNodeIds); useEffect(() => { selectedNodeIdsRef.current = selectedNodeIds }, [selectedNodeIds])
        const primarySelectedId = selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null

        // Helper: sets both ref (for stable closures) and state (for reactivity)
        const setDetachingOffset = useCallback((val: { dx: number; dy: number } | null) => {
            detachingOffsetRef.current = val
            setDetachingOffsetState(val)
        }, [])

        const baseRenderRects = useMemo(() => computeRenderRects(nodes, frozenColumnId, frozenRectsRef.current), [nodes, frozenColumnId])
        const renderRects = useMemo(() => {
            if (!detachingRef.current || !detachingOffsetState) return baseRenderRects
            const d = detachingRef.current, result = new Map(baseRenderRects)
            result.set(d.nodeId, { x: d.frozenRect.x + detachingOffsetState.dx, y: d.frozenRect.y + detachingOffsetState.dy, width: d.frozenRect.width, height: d.frozenRect.height })
            return result
        }, [baseRenderRects, detachingOffsetState])

        // Column height is derived in computeRenderRects — no auto-expand sync needed

        // ── History ──
        const historyRef = useRef<UndoHistory>(initialUndoHistory ? structuredClone(initialUndoHistory) : { stack: [{ nodes: structuredClone(initialNodes ?? []), edges: structuredClone(initialEdges ?? []) }], cursor: 0 })
        const emitNodesChange = useCallback(() => { if (onNodesChange) onNodesChange(structuredClone(nodesRef.current), structuredClone(edgesRef.current)) }, [onNodesChange])
        const emitHistoryChange = useCallback(() => { if (onUndoHistoryChange) onUndoHistoryChange(structuredClone(historyRef.current)) }, [onUndoHistoryChange])
        const pushHistory = useCallback(() => {
            const h = historyRef.current; h.stack = h.stack.slice(0, h.cursor + 1)
            h.stack.push({ nodes: structuredClone(nodesRef.current), edges: structuredClone(edgesRef.current) })
            if (h.stack.length > HISTORY_MAX) h.stack.shift(); else h.cursor++; emitHistoryChange()
        }, [emitHistoryChange])
        const undo = useCallback(() => { const h = historyRef.current; if (h.cursor <= 0) return; h.cursor--; const p = structuredClone(h.stack[h.cursor]); setNodes(p.nodes); setEdges(p.edges); emitHistoryChange(); setTimeout(emitNodesChange, 0) }, [emitNodesChange, emitHistoryChange])
        const redo = useCallback(() => { const h = historyRef.current; if (h.cursor >= h.stack.length - 1) return; h.cursor++; const n = structuredClone(h.stack[h.cursor]); setNodes(n.nodes); setEdges(n.edges); emitHistoryChange(); setTimeout(emitNodesChange, 0) }, [emitNodesChange, emitHistoryChange])

        // ── Keyboard ──
        useEffect(() => {
            const kd = (e: KeyboardEvent) => {
                const mod = e.metaKey || e.ctrlKey
                if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
                if (mod && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo() }
                if (e.key === 'Escape') { setSelectedNodeIds(new Set()); setSelectedEdgeId(null); setEditingEdgeLabel(null); setInteractionMode('idle'); setEditingField(null) }
                if ((e.key === 'Delete' || e.key === 'Backspace') && interactionMode === 'idle') {
                    const a = document.activeElement; if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return
                    if (selectedEdgeId) { e.preventDefault(); setEdges(p => p.filter(ed => ed.id !== selectedEdgeId)); setSelectedEdgeId(null); setEditingEdgeLabel(null); setTimeout(() => { pushHistory(); emitNodesChange() }, 0); return }
                    if (selectedNodeIdsRef.current.size > 0) {
                        e.preventDefault(); const del = new Set(selectedNodeIdsRef.current)
                        // Expand: if deleting columns, also delete their children
                        nodesRef.current.forEach(n => {
                            if (n.type === 'column' && del.has(n.id)) {
                                nodesRef.current.forEach(c => { if ((c.data as any).parentId === n.id) del.add(c.id) })
                            }
                        })
                        setNodes(p => {
                            let u = p.filter(n => !del.has(n.id))
                            return u.map(n => n.type === 'column' && (n as ColumnNode).data.childOrder ? { ...n, data: { ...n.data, childOrder: (n as ColumnNode).data.childOrder!.filter(id => !del.has(id)) } } : n)
                        })
                        setEdges(p => p.filter(ed => !del.has(ed.from) && !del.has(ed.to)))
                        setSelectedNodeIds(new Set()); setSelectedEdgeId(null); setEditingEdgeLabel(null); setInteractionMode('idle'); setEditingField(null)
                        setTimeout(() => { pushHistory(); emitNodesChange() }, 0)
                    }
                }
            }
            window.addEventListener('keydown', kd); return () => window.removeEventListener('keydown', kd)
        }, [undo, redo, selectedEdgeId, interactionMode, pushHistory, emitNodesChange])

        // ── Create ──
        const createNodeAt = useCallback((x: number, y: number) => {
            const n: NoteNode = { id: crypto.randomUUID(), type: 'note', x: Math.round(x - 100), y: Math.round(y - 60), width: 200, height: 120, zIndex: nodesRef.current.length + 1, data: {} }
            setNodes(p => [...p, n]); setSelectedNodeIds(new Set([n.id])); setSelectedEdgeId(null); setEditingEdgeLabel(null); setInteractionMode('idle')
            setTimeout(() => { pushHistory(); emitNodesChange() }, 0)
        }, [pushHistory, emitNodesChange])

        const createImageNodeAt = useCallback((x: number, y: number, imgData: ImageData) => {
            const { naturalWidth: nw, naturalHeight: nh } = imgData; const r = nw / nh
            let w: number, h: number
            if (nw > MAX_INITIAL_IMAGE_WIDTH || nh > MAX_INITIAL_IMAGE_HEIGHT) { if (r > MAX_INITIAL_IMAGE_WIDTH / MAX_INITIAL_IMAGE_HEIGHT) { w = MAX_INITIAL_IMAGE_WIDTH; h = w / r } else { h = MAX_INITIAL_IMAGE_HEIGHT; w = h * r } } else { w = nw; h = nh }
            const n: ImageNode = { id: crypto.randomUUID(), type: 'image', x: Math.round(x - w / 2), y: Math.round(y - h / 2), width: Math.round(w), height: Math.round(h), zIndex: nodesRef.current.length + 1, data: imgData }
            setNodes(p => [...p, n]); setSelectedNodeIds(new Set([n.id])); setSelectedEdgeId(null); setEditingEdgeLabel(null); setInteractionMode('idle')
            setTimeout(() => { pushHistory(); emitNodesChange() }, 0)
        }, [pushHistory, emitNodesChange])

        const createColumnNodeAt = useCallback((x: number, y: number) => {
            const n: ColumnNode = { id: crypto.randomUUID(), type: 'column', x: Math.round(x - COLUMN_DEFAULT_WIDTH / 2), y: Math.round(y - COLUMN_DEFAULT_HEIGHT / 2), width: COLUMN_DEFAULT_WIDTH, height: COLUMN_DEFAULT_HEIGHT, zIndex: nodesRef.current.length + 1, data: { collapsed: false } }
            setNodes(p => [...p, n]); setSelectedNodeIds(new Set([n.id])); setSelectedEdgeId(null); setEditingEdgeLabel(null); setInteractionMode('idle')
            setTimeout(() => { pushHistory(); emitNodesChange() }, 0)
        }, [pushHistory, emitNodesChange])

        useImperativeHandle(ref, () => ({
            getSnapshot: () => ({ nodes: structuredClone(nodes), edges: structuredClone(edges) }),
            createNodeAt, createImageNodeAt, createColumnNodeAt,
            getCanvasRect: () => canvasRef.current?.getBoundingClientRect() ?? null,
        }), [nodes, edges, createNodeAt, createImageNodeAt, createColumnNodeAt])

        useEffect(() => {
            setSelectedNodeIds(new Set()); setSelectedEdgeId(null); setEditingEdgeLabel(null); setInteractionMode('idle'); setEditingField(null)
            dragRef.current = null; resizeRef.current = null; selBoxRef.current = null; connectionRef.current = null
            detachingRef.current = null; setDetachingOffset(null); setFrozenColumnId(null); frozenRectsRef.current = null
            setSelectionBoxRect(null); setConnectionGhost(null)
        }, [takeId])

        // ============================================
        // CONTENT MEASURED (DOM measurement for text nodes)
        // ============================================
        const handleContentMeasured = useCallback((nodeId: string, measuredHeight: number) => {
            // Only update if the node is a child of a column — free nodes keep their manual height
            const node = nodesRef.current.find(n => n.id === nodeId)
            if (!node || node.type !== 'note') return
            if (!(node.data as any).parentId) return // free node: don't override height
            const rounded = Math.ceil(measuredHeight)
            if (Math.abs(node.height - rounded) < 1) return // guardrail: avoid render→measure→setState loop
            setNodes(p => p.map(n => n.id === nodeId ? { ...n, height: rounded } : n))
        }, [])

        // ============================================
        // DRAG
        // ============================================
        const handleWindowMouseMove = useCallback((e: MouseEvent) => {
            if (!dragRef.current) return
            const dx = e.clientX - dragRef.current.startMouseX, dy = e.clientY - dragRef.current.startMouseY
            if (!dragRef.current.hasMoved && Math.hypot(dx, dy) > DRAG_THRESHOLD) { dragRef.current.hasMoved = true; setInteractionMode('dragging') }
            if (!dragRef.current.hasMoved) return
            e.preventDefault()
            if (detachingRef.current) { setDetachingOffset({ dx, dy }); return }
            const off = dragRef.current.offsets
            setNodes(p => p.map(n => { const o = off.get(n.id); return o ? { ...n, x: o.startX + dx, y: o.startY + dy } : n }))
        }, [])

        const handleWindowMouseUp = useCallback(() => {
            window.removeEventListener('mousemove', handleWindowMouseMove)
            window.removeEventListener('mouseup', handleWindowMouseUp)

            if (!dragRef.current?.hasMoved) {
                dragRef.current = null; detachingRef.current = null; setDetachingOffset(null)
                setFrozenColumnId(null); frozenRectsRef.current = null; return
            }

            const det = detachingRef.current
            const off = detachingOffsetRef.current // READ FROM REF — stable, no stale closure
            detachingRef.current = null; setDetachingOffset(null); setFrozenColumnId(null); frozenRectsRef.current = null

            if (det && off) {
                const fx = det.frozenRect.x + off.dx, fy = det.frozenRect.y + off.dy
                const cx = fx + det.frozenRect.width / 2, cy = fy + det.frozenRect.height / 2

                setNodes(prev => {
                    const rects = computeRenderRects(prev, null, null)
                    let targetColId: string | null = null
                    for (const n of prev) {
                        if (n.type !== 'column' || n.id === det.nodeId || (n as ColumnNode).data.collapsed) continue
                        const colRect = rects.get(n.id)
                        if (colRect && insideColBodyRect(colRect, cx, cy)) { targetColId = n.id; break }
                    }

                    const insertIdx = targetColId ? getInsertionIndex(prev, rects, targetColId, cy, det.nodeId) : 0

                    return prev.map(n => {
                        if (n.id === det.nodeId) {
                            return targetColId
                                ? { ...n, data: { ...n.data, parentId: targetColId } }
                                : { ...n, x: fx, y: fy, width: det.frozenRect.width, data: { ...n.data, parentId: null } }
                        }
                        if (n.type === 'column') {
                            const col = n as ColumnNode
                            let order = [...(col.data.childOrder || [])]

                            if (n.id === det.originalParentId && n.id === targetColId) {
                                order = order.filter(id => id !== det.nodeId)
                                order.splice(insertIdx, 0, det.nodeId)
                                return { ...n, data: { ...n.data, childOrder: order } }
                            }
                            if (n.id === targetColId) {
                                order = order.filter(id => id !== det.nodeId)
                                order.splice(insertIdx, 0, det.nodeId)
                                return { ...n, data: { ...n.data, childOrder: order } }
                            }
                            if (n.id === det.originalParentId && n.id !== targetColId) {
                                return { ...n, data: { ...n.data, childOrder: order.filter(id => id !== det.nodeId) } }
                            }
                        }
                        return n
                    })
                })
            } else {
                const ids = new Set(dragRef.current!.offsets.keys())
                setNodes(prev => {
                    const rects = computeRenderRects(prev, null, null)
                    let u = [...prev]
                    for (const id of ids) {
                        const nd = u.find(n => n.id === id)
                        if (!nd || nd.type === 'column' || (nd.data as any).parentId) continue
                        const ncx = nd.x + nd.width / 2, ncy = nd.y + nd.height / 2
                        let tgt: string | null = null
                        for (const c of u) {
                            if (c.type !== 'column' || c.id === id || (c as ColumnNode).data.collapsed) continue
                            const colRect = rects.get(c.id)
                            if (colRect && insideColBodyRect(colRect, ncx, ncy)) { tgt = c.id; break }
                        }
                        if (tgt) {
                            const insertIdx = getInsertionIndex(u, rects, tgt, ncy, id)
                            u = u.map(n => {
                                if (n.id === id) return { ...n, data: { ...n.data, parentId: tgt } }
                                if (n.id === tgt && n.type === 'column') {
                                    const o = [...((n as ColumnNode).data.childOrder || [])].filter(cid => cid !== id)
                                    o.splice(insertIdx, 0, id)
                                    return { ...n, data: { ...n.data, childOrder: o } }
                                }
                                return n
                            })
                        }
                    }
                    return u
                })
            }

            setInteractionMode('idle'); pushHistory(); emitNodesChange()
            dragRef.current = null
        }, [handleWindowMouseMove, pushHistory, emitNodesChange, setDetachingOffset])

        useEffect(() => { return () => { window.removeEventListener('mousemove', handleWindowMouseMove); window.removeEventListener('mouseup', handleWindowMouseUp) } }, [handleWindowMouseMove, handleWindowMouseUp])

        // ── Selection box ──
        const handleSelBoxMouseMove = useCallback((e: MouseEvent) => {
            const sb = selBoxRef.current; if (!sb) return; e.preventDefault()
            const cx = e.clientX - sb.canvasRect.left, cy = e.clientY - sb.canvasRect.top
            setSelectionBoxRect({ left: Math.min(sb.startX, cx), top: Math.min(sb.startY, cy), width: Math.abs(cx - sb.startX), height: Math.abs(cy - sb.startY) })
        }, [])
        const handleSelBoxMouseUp = useCallback(() => {
            window.removeEventListener('mousemove', handleSelBoxMouseMove); window.removeEventListener('mouseup', handleSelBoxMouseUp)
            setTimeout(() => {
                const boxEl = document.querySelector('[data-selection-box]')
                if (boxEl) {
                    const br = boxEl.getBoundingClientRect(), cr = canvasRef.current?.getBoundingClientRect()
                    if (cr && br.width > 2 && br.height > 2) {
                        const l = br.left - cr.left, t = br.top - cr.top, r = l + br.width, b = t + br.height
                        const rects = computeRenderRects(nodesRef.current, null, null); const sel = new Set<string>()
                        nodesRef.current.forEach(n => { if (nodeHidden(n, nodesRef.current)) return; const rc = rects.get(n.id); if (rc && rc.x < r && rc.x + rc.width > l && rc.y < b && rc.y + rc.height > t) sel.add(n.id) })
                        setSelectedNodeIds(sel)
                    }
                }
                setSelectionBoxRect(null); selBoxRef.current = null; setInteractionMode('idle')
            }, 0)
        }, [handleSelBoxMouseMove])
        useEffect(() => { return () => { window.removeEventListener('mousemove', handleSelBoxMouseMove); window.removeEventListener('mouseup', handleSelBoxMouseUp) } }, [handleSelBoxMouseMove, handleSelBoxMouseUp])

        // ── Connection ──
        const handleConnectionMouseMove = useCallback((e: MouseEvent) => {
            const c = connectionRef.current; if (!c) return; e.preventDefault()
            const rects = computeRenderRects(nodesRef.current, null, null); const fr = rects.get(c.fromNodeId); if (!fr) return
            const tx = e.clientX - c.canvasRect.left, ty = e.clientY - c.canvasRect.top; const f = edgeAnchor(fr, tx, ty)
            setConnectionGhost({ fromX: f.x, fromY: f.y, toX: tx, toY: ty })
        }, [])
        const handleConnectionMouseUp = useCallback((e: MouseEvent) => {
            window.removeEventListener('mousemove', handleConnectionMouseMove); window.removeEventListener('mouseup', handleConnectionMouseUp)
            const c = connectionRef.current
            if (c) {
                const mx = e.clientX - c.canvasRect.left, my = e.clientY - c.canvasRect.top
                const rects = computeRenderRects(nodesRef.current, null, null)
                const tgt = nodesRef.current.find(n => { if (n.id === c.fromNodeId || nodeHidden(n, nodesRef.current)) return false; const r = rects.get(n.id); return r && mx >= r.x && mx <= r.x + r.width && my >= r.y && my <= r.y + r.height })
                if (tgt && !edgesRef.current.some(e => (e.from === c.fromNodeId && e.to === tgt.id) || (e.from === tgt.id && e.to === c.fromNodeId))) {
                    setEdges(p => [...p, { id: crypto.randomUUID(), from: c.fromNodeId, to: tgt.id }]); setTimeout(() => { pushHistory(); emitNodesChange() }, 0)
                }
            }
            connectionRef.current = null; setConnectionGhost(null); setInteractionMode('idle')
        }, [handleConnectionMouseMove, pushHistory, emitNodesChange])
        const handleConnectionStart = useCallback((nodeId: string, mx: number, my: number) => {
            const cr = canvasRef.current?.getBoundingClientRect(); if (!cr) return
            connectionRef.current = { fromNodeId: nodeId, startX: mx - cr.left, startY: my - cr.top, canvasRect: cr }
            setInteractionMode('connecting'); setSelectedEdgeId(null); setEditingEdgeLabel(null)
            window.addEventListener('mousemove', handleConnectionMouseMove); window.addEventListener('mouseup', handleConnectionMouseUp)
        }, [handleConnectionMouseMove, handleConnectionMouseUp])
        useEffect(() => { return () => { window.removeEventListener('mousemove', handleConnectionMouseMove); window.removeEventListener('mouseup', handleConnectionMouseUp) } }, [handleConnectionMouseMove, handleConnectionMouseUp])

        // ── Resize ──
        const handleResizeMouseMove = useCallback((e: MouseEvent) => {
            if (!resizeRef.current) return; e.preventDefault()
            const dx = e.clientX - resizeRef.current.startMouseX, dy = e.clientY - resizeRef.current.startMouseY
            let nw: number, nh: number
            if (resizeRef.current.aspectRatio !== null) {
                // Image: aspect ratio lock
                nw = Math.max(MIN_IMAGE_SIZE, resizeRef.current.startWidth + dx); nh = nw / resizeRef.current.aspectRatio
                if (nh < MIN_IMAGE_SIZE) { nh = MIN_IMAGE_SIZE; nw = nh * resizeRef.current.aspectRatio }
            } else {
                nw = Math.max(MIN_WIDTH, resizeRef.current.startWidth + dx)
                // Column: height derived from content, only width resizable
                const node = nodesRef.current.find(n => n.id === resizeRef.current!.nodeId)
                if (node?.type === 'column') {
                    nh = node.height // keep current (will be recalculated by computeRenderRects)
                } else {
                    nh = Math.max(MIN_HEIGHT, resizeRef.current.startHeight + dy)
                }
            }
            const rid = resizeRef.current.nodeId
            setNodes(p => p.map(n => n.id === rid ? { ...n, width: Math.round(nw), height: Math.round(nh) } : n))
        }, [])
        const handleResizeMouseUp = useCallback(() => {
            window.removeEventListener('mousemove', handleResizeMouseMove); window.removeEventListener('mouseup', handleResizeMouseUp)
            if (resizeRef.current) { setInteractionMode('idle'); pushHistory(); emitNodesChange() }
            resizeRef.current = null
        }, [handleResizeMouseMove, pushHistory, emitNodesChange])
        const handleResizeStart = useCallback((nodeId: string, mx: number, my: number) => {
            const nd = nodesRef.current.find(n => n.id === nodeId); if (!nd) return
            if (nd.type !== 'column' && (nd.data as any).parentId) return
            if (nd.type === 'column' && (nd.data as ColumnData).collapsed) return
            const ar = nd.type === 'image' ? nd.width / nd.height : null
            resizeRef.current = { nodeId, startWidth: nd.width, startHeight: nd.height, startMouseX: mx, startMouseY: my, aspectRatio: ar }
            setInteractionMode('resizing')
            window.addEventListener('mousemove', handleResizeMouseMove); window.addEventListener('mouseup', handleResizeMouseUp)
        }, [handleResizeMouseMove, handleResizeMouseUp])
        useEffect(() => { return () => { window.removeEventListener('mousemove', handleResizeMouseMove); window.removeEventListener('mouseup', handleResizeMouseUp) } }, [handleResizeMouseMove, handleResizeMouseUp])

        const handleRequestHeight = useCallback((nodeId: string, rh: number) => {
            setNodes(p => p.map(n => n.id === nodeId && rh > n.height ? { ...n, height: rh } : n)); emitNodesChange()
        }, [emitNodesChange])

        const handleToggleCollapse = useCallback((nodeId: string) => {
            if (detachingRef.current?.originalParentId === nodeId) return
            setNodes(p => p.map(n => {
                if (n.id !== nodeId || n.type !== 'column') return n
                const col = n as ColumnNode
                const wasCollapsed = col.data.collapsed ?? false
                return { ...col, data: { ...col.data, collapsed: !wasCollapsed } }
            }))
            setTimeout(() => { pushHistory(); emitNodesChange() }, 0)
        }, [pushHistory, emitNodesChange])

        // ── Node handlers ──
        const handleSelect = useCallback((nodeId: string) => {
            if (selectedNodeIdsRef.current.has(nodeId) && selectedNodeIdsRef.current.size > 1) return
            setSelectedNodeIds(new Set([nodeId])); setSelectedEdgeId(null); setEditingEdgeLabel(null)
        }, [])

        const handlePotentialDragStart = useCallback((nodeId: string, mouseX: number, mouseY: number) => {
            const nd = nodesRef.current.find(n => n.id === nodeId); if (!nd) return
            const isChild = nd.type !== 'column' && !!(nd.data as any).parentId

            if (isChild) {
                const currentRects = computeRenderRects(nodesRef.current, null, null)
                const renderRect = currentRects.get(nodeId); if (!renderRect) return
                const parentId = (nd.data as any).parentId as string
                frozenRectsRef.current = currentRects; setFrozenColumnId(parentId)
                detachingRef.current = { nodeId, frozenRect: { ...renderRect }, originalParentId: parentId }
                setDetachingOffset({ dx: 0, dy: 0 })
                dragRef.current = { nodeId, offsets: new Map([[nodeId, { startX: renderRect.x, startY: renderRect.y }]]), startMouseX: mouseX, startMouseY: mouseY, hasMoved: false }
            } else {
                const sel = selectedNodeIdsRef.current.has(nodeId) ? selectedNodeIdsRef.current : new Set([nodeId])
                const off = new Map<string, { startX: number; startY: number }>()
                nodesRef.current.forEach(n => { if (sel.has(n.id)) off.set(n.id, { startX: n.x, startY: n.y }) })
                dragRef.current = { nodeId, offsets: off, startMouseX: mouseX, startMouseY: mouseY, hasMoved: false }
            }

            if (!selectedNodeIdsRef.current.has(nodeId)) setSelectedNodeIds(new Set([nodeId]))
            window.addEventListener('mousemove', handleWindowMouseMove); window.addEventListener('mouseup', handleWindowMouseUp)
        }, [handleWindowMouseMove, handleWindowMouseUp])

        const handleDelete = useCallback((nodeId: string) => {
            setNodes(p => {
                const node = p.find(n => n.id === nodeId)
                // Collect IDs to delete: the node itself + children if it's a column
                const deleteIds = new Set([nodeId])
                if (node?.type === 'column') {
                    p.forEach(n => { if ((n.data as any).parentId === nodeId) deleteIds.add(n.id) })
                }
                let u = p.filter(n => !deleteIds.has(n.id))
                // Clean childOrder in any column that referenced deleted nodes
                return u.map(n => {
                    if (n.type === 'column' && (n as ColumnNode).data.childOrder) {
                        const filtered = (n as ColumnNode).data.childOrder!.filter(id => !deleteIds.has(id))
                        if (filtered.length !== (n as ColumnNode).data.childOrder!.length)
                            return { ...n, data: { ...n.data, childOrder: filtered } }
                    }
                    return n
                })
            })
            setEdges(p => {
                const node = nodesRef.current.find(n => n.id === nodeId)
                const deleteIds = new Set([nodeId])
                if (node?.type === 'column') {
                    nodesRef.current.forEach(n => { if ((n.data as any).parentId === nodeId) deleteIds.add(n.id) })
                }
                return p.filter(e => !deleteIds.has(e.from) && !deleteIds.has(e.to))
            })
            setSelectedNodeIds(new Set()); setSelectedEdgeId(null); setEditingEdgeLabel(null); setInteractionMode('idle'); setEditingField(null)
            setTimeout(() => { pushHistory(); emitNodesChange() }, 0)
        }, [pushHistory, emitNodesChange])

        const handleStartEditing = useCallback((nodeId: string, field: 'title' | 'body') => { setSelectedNodeIds(new Set([nodeId])); setSelectedEdgeId(null); setEditingEdgeLabel(null); setInteractionMode('editing'); setEditingField(field) }, [])
        const handleFieldFocus = useCallback((f: 'title' | 'body') => setEditingField(f), [])
        const handleFieldBlur = useCallback(() => { setInteractionMode('idle'); setEditingField(null) }, [])
        const handleDataChange = useCallback((nodeId: string, data: NoteData | ColumnData) => { setNodes(p => p.map(n => n.id === nodeId ? { ...n, data: data as any } : n)); setTimeout(() => { pushHistory(); emitNodesChange() }, 0) }, [pushHistory, emitNodesChange])

        const handleSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
            const cr = canvasRef.current?.getBoundingClientRect(); if (!cr) return
            const mx = e.clientX - cr.left, my = e.clientY - cr.top
            let best: CanvasEdge | null = null, bd = EDGE_HIT_DISTANCE
            edgesRef.current.forEach(edge => {
                const fn = nodesRef.current.find(n => n.id === edge.from), tn = nodesRef.current.find(n => n.id === edge.to)
                if (!fn || !tn || nodeHidden(fn, nodesRef.current) || nodeHidden(tn, nodesRef.current)) return
                const fr = renderRects.get(edge.from), tr = renderRects.get(edge.to); if (!fr || !tr) return
                const a = edgeAnchor(fr, rectCenter(tr).x, rectCenter(tr).y), b = edgeAnchor(tr, rectCenter(fr).x, rectCenter(fr).y)
                const d = distToSeg(mx, my, a.x, a.y, b.x, b.y); if (d < bd) { bd = d; best = edge }
            })
            if (best) { e.stopPropagation(); setSelectedEdgeId(best.id); setEditingEdgeLabel(null); setSelectedNodeIds(new Set()) }
        }, [renderRects])

        const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
            if (interactionMode === 'editing') return
            const r = canvasRef.current?.getBoundingClientRect(); if (!r) return
            selBoxRef.current = { startX: e.clientX - r.left, startY: e.clientY - r.top, canvasRect: r }
            setSelectionBoxRect({ left: e.clientX - r.left, top: e.clientY - r.top, width: 0, height: 0 })
            setInteractionMode('selecting'); setSelectedNodeIds(new Set()); setSelectedEdgeId(null); setEditingEdgeLabel(null); setEditingField(null)
            window.addEventListener('mousemove', handleSelBoxMouseMove); window.addEventListener('mouseup', handleSelBoxMouseUp)
        }, [interactionMode, handleSelBoxMouseMove, handleSelBoxMouseUp])

        const visibleNodes = nodes.filter(n => !nodeHidden(n, nodes))
        const edgeLines = useMemo(() => edges.map(edge => {
            const fn = nodes.find(n => n.id === edge.from), tn = nodes.find(n => n.id === edge.to)
            if (!fn || !tn || nodeHidden(fn, nodes) || nodeHidden(tn, nodes)) return null
            const fr = renderRects.get(edge.from), tr = renderRects.get(edge.to); if (!fr || !tr) return null
            const fc = rectCenter(fr), tc = rectCenter(tr)
            return { edge, from: edgeAnchor(fr, tc.x, tc.y), to: edgeAnchor(tr, fc.x, fc.y) }
        }).filter(Boolean) as { edge: CanvasEdge; from: { x: number; y: number }; to: { x: number; y: number } }[], [edges, nodes, renderRects])

        return (
            <div ref={canvasRef} className="flex-1 bg-zinc-950 relative overflow-hidden" onMouseDown={handleCanvasMouseDown}>
                <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
                    <defs>
                        <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#71717a" /></marker>
                        <marker id="arrowhead-selected" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#3b82f6" /></marker>
                    </defs>
                    <g style={{ pointerEvents: 'stroke' }} onClick={handleSvgClick as any}>
                        {edgeLines.map(({ edge, from, to }) => <line key={`h-${edge.id}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="transparent" strokeWidth={EDGE_HIT_DISTANCE * 2} style={{ cursor: 'pointer', pointerEvents: 'stroke' }} />)}
                    </g>
                    {edgeLines.map(({ edge, from, to }) => { const s = edge.id === selectedEdgeId; return <line key={edge.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={s ? '#3b82f6' : '#71717a'} strokeWidth={s ? 2 : 1.5} markerEnd={s ? 'url(#arrowhead-selected)' : 'url(#arrowhead)'} /> })}
                    {connectionGhost && <line x1={connectionGhost.fromX} y1={connectionGhost.fromY} x2={connectionGhost.toX} y2={connectionGhost.toY} stroke="#10b981" strokeWidth={2} strokeDasharray="6 3" markerEnd="url(#arrowhead)" />}
                </svg>

                {edgeLines.map(({ edge, from, to }) => {
                    const s = edge.id === selectedEdgeId; if (!s && !edge.label) return null
                    const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2
                    return (
                        <div key={`l-${edge.id}`} className="absolute pointer-events-auto z-[5]" style={{ left: mx, top: my, transform: 'translate(-50%, -50%)' }} onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
                            {s ? <input type="text" autoFocus={editingEdgeLabel === edge.id} placeholder="label..." defaultValue={edge.label || ''}
                                onFocus={() => setEditingEdgeLabel(edge.id)}
                                onBlur={ev => { const v = ev.target.value.trim(); setEdges(p => p.map(ed => ed.id === edge.id ? { ...ed, label: v || undefined } : ed)); setEditingEdgeLabel(null); setTimeout(() => { pushHistory(); emitNodesChange() }, 0) }}
                                onKeyDown={ev => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); if (ev.key === 'Escape') { (ev.target as HTMLInputElement).value = edge.label || ''; (ev.target as HTMLInputElement).blur() }; ev.stopPropagation() }}
                                className="bg-zinc-800 border border-blue-500 text-zinc-200 text-[10px] px-1.5 py-0.5 outline-none text-center min-w-[60px] max-w-[120px]" />
                                : <span className="text-[10px] text-zinc-500 bg-zinc-900/80 px-1 py-0.5">{edge.label}</span>}
                        </div>
                    )
                })}

                {visibleNodes.map(node => {
                    const rect = renderRects.get(node.id); if (!rect) return null
                    let rz = node.zIndex
                    if (node.type !== 'column' && (node.data as any).parentId) {
                        const parent = nodes.find(n => n.id === (node.data as any).parentId)
                        if (parent) rz = parent.zIndex + 1
                    }
                    return (
                        <NodeShell key={node.id} nodeId={node.id} x={rect.x} y={rect.y} width={rect.width} height={rect.height} zIndex={rz}
                            isSelected={selectedNodeIds.has(node.id)}
                            isDragging={interactionMode === 'dragging' && dragRef.current?.offsets.has(node.id) === true}
                            interactionMode={interactionMode}
                            onSelect={handleSelect} onPotentialDragStart={handlePotentialDragStart}
                            onDelete={handleDelete} onResizeStart={handleResizeStart} onConnectionStart={handleConnectionStart}>
                            {node.type === 'note' ? <NoteContent data={node.data} isEditing={interactionMode === 'editing' && node.id === primarySelectedId} editingField={node.id === primarySelectedId ? editingField : null} onDataChange={d => handleDataChange(node.id, d)} onFieldFocus={handleFieldFocus} onFieldBlur={handleFieldBlur} onStartEditing={f => handleStartEditing(node.id, f)} onRequestHeight={h => handleRequestHeight(node.id, h)} onContentMeasured={h => handleContentMeasured(node.id, h)} />
                                : node.type === 'image' ? <ImageContent data={node.data} />
                                    : <ColumnContent data={node.data} isEditing={interactionMode === 'editing' && node.id === primarySelectedId} editingField={node.id === primarySelectedId ? editingField : null} onDataChange={d => handleDataChange(node.id, d)} onFieldBlur={handleFieldBlur} onStartEditing={f => handleStartEditing(node.id, f)} onToggleCollapse={() => handleToggleCollapse(node.id)} />}
                        </NodeShell>
                    )
                })}

                {selectionBoxRect && selectionBoxRect.width > 2 && selectionBoxRect.height > 2 && (
                    <div data-selection-box className="absolute border border-blue-500 bg-blue-500/10 pointer-events-none z-[9998]" style={{ left: selectionBoxRect.left, top: selectionBoxRect.top, width: selectionBoxRect.width, height: selectionBoxRect.height }} />
                )}

                {nodes.length === 0 && edges.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><p className="text-zinc-600 text-sm">Drag "Note" or "Image" from sidebar to canvas</p></div>
                )}
            </div>
        )
    })