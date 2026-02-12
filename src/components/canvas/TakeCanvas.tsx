'use client'

import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle, useMemo } from 'react'
import { NodeShell } from './NodeShell'
import { NoteContent, ImageContent, ColumnContent, type NoteData, type ImageData, type ColumnData } from './NodeContent'
import { PromptContent, type PromptData, type PromptType } from './PromptContent'
import { ImageInspectOverlay } from './ImageInspectOverlay'
import {
    screenToWorld,
    screenDeltaToWorld,
    zoomAtPoint,
    VIEWPORT_INITIAL,
    ZOOM_MIN,
    ZOOM_MAX,
    type ViewportState,
} from '@/utils/screenToWorld'

// ===================================================
// TAKE CANVAS — PURE WORK AREA (R4-005)
// ===================================================
// R4-004c: Column Spatial Influence — collapse/expand shifts nearby free nodes vertically
// R4-005: Zoom & Pan — viewport transform, screenToWorld on all interaction points
//
// PRINCIPLE: Nodes live in WORLD space. The viewport transforms for display.
//            Zoom/Pan does NOT enter undo history.

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

// R4-004c — Column Toggle: Vertical Wall Cascade
const MIN_GAP = 15

// Blocco 4 — Prompt Node (Memory Node)
const PROMPT_DEFAULT_WIDTH = 280
const PROMPT_DEFAULT_HEIGHT = 180

interface TakeCanvasProps {
    takeId: string
    initialNodes?: CanvasNode[]
    initialEdges?: CanvasEdge[]
    onNodesChange?: (nodes: CanvasNode[], edges: CanvasEdge[]) => void
    initialUndoHistory?: UndoHistory
    onUndoHistoryChange?: (history: UndoHistory) => void
    onPromoteSelection?: (imageNodeId: string, imageData: ImageData, promptData?: { body: string; promptType: string; origin: string; createdAt?: string } | null) => Promise<{ selectionId: string; selectionNumber: number } | null>
    onDiscardSelection?: (selectionId: string, reason: 'undo' | 'manual') => Promise<void>
    shotSelections?: { selectionId: string; selectionNumber: number; storagePath: string; src: string }[]
}

export type CanvasNode = NoteNode | ImageNode | ColumnNode | PromptNode

interface NoteNode { id: string; type: 'note'; x: number; y: number; width: number; height: number; zIndex: number; data: NoteData & { parentId?: string | null } }
interface ImageNode { id: string; type: 'image'; x: number; y: number; width: number; height: number; zIndex: number; data: ImageData & { parentId?: string | null; origin_prompt_id?: string; aspectRatio?: number; promotedSelectionId?: string; selectionNumber?: number } }
interface ColumnNode { id: string; type: 'column'; x: number; y: number; width: number; height: number; zIndex: number; data: ColumnData & { expandedHeight?: number; childOrder?: string[] } }
interface PromptNode { id: string; type: 'prompt'; x: number; y: number; width: number; height: number; zIndex: number; data: PromptData & { parentId?: string | null } }

export interface CanvasEdge { id: string; from: string; to: string; label?: string }

export interface TakeCanvasHandle {
    getSnapshot: () => { nodes: CanvasNode[]; edges: CanvasEdge[] }
    createNodeAt: (x: number, y: number) => void
    createImageNodeAt: (x: number, y: number, imageData: ImageData) => void
    createColumnNodeAt: (x: number, y: number) => void
    createPromptNodeAt: (x: number, y: number) => void
    // Screen-coordinate variants: caller passes screen-relative coords,
    // TakeCanvas converts to world internally. Sidebar should use these.
    createNodeAtScreen: (screenX: number, screenY: number) => void
    createImageNodeAtScreen: (screenX: number, screenY: number, imageData: ImageData) => void
    createColumnNodeAtScreen: (screenX: number, screenY: number) => void
    createPromptNodeAtScreen: (screenX: number, screenY: number) => void
    getCanvasRect: () => DOMRect | null
}

type InteractionMode = 'idle' | 'dragging' | 'editing' | 'resizing' | 'selecting' | 'connecting' | 'panning'

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
    for (const n of nodes) {
        if (!(n.data as any).parentId || n.type === 'column')
            rects.set(n.id, { x: n.x, y: n.y, width: n.width, height: n.height })
    }
    for (const n of nodes) {
        if (n.type !== 'column') continue
        const col = n as ColumnNode
        if (col.data.collapsed) { rects.set(col.id, { x: col.x, y: col.y, width: col.width, height: COLUMN_COLLAPSED_HEIGHT }); continue }
        if (col.id === frozenColumnId && frozenRects) {
            const children = nodes.filter(c => c.type !== 'column' && (c.data as any).parentId === col.id)
            for (const child of children) { const fr = frozenRects.get(child.id); if (fr) rects.set(child.id, fr) }
            const fcr = frozenRects.get(col.id)
            if (fcr) rects.set(col.id, { ...fcr, width: col.width }); continue
        }
        const order = col.data.childOrder || []
        const children = nodes.filter(c => c.type !== 'column' && (c.data as any).parentId === col.id)
        children.sort((a, b) => { const ai = order.indexOf(a.id), bi = order.indexOf(b.id); if (ai !== -1 && bi !== -1) return ai - bi; if (ai !== -1) return -1; if (bi !== -1) return 1; return 0 })
        const iw = col.width - COLUMN_PADDING * 2
        let cy = col.y + COLUMN_HEADER_HEIGHT + COLUMN_PADDING
        for (const child of children) {
            let h = child.height
            if (child.type === 'image') { const d = child.data as ImageData; h = Math.round(iw / (d.naturalWidth / d.naturalHeight)) }
            rects.set(child.id, { x: col.x + COLUMN_PADDING, y: cy, width: iw, height: h }); cy += h + CHILD_GAP
        }
        const minHeight = COLUMN_HEADER_HEIGHT + COLUMN_MIN_BODY_HEIGHT + COLUMN_PADDING * 2
        const contentBottom = children.length > 0 ? cy - CHILD_GAP + COLUMN_PADDING : col.y + minHeight
        const derivedHeight = Math.max(minHeight, contentBottom - col.y)
        rects.set(col.id, { x: col.x, y: col.y, width: col.width, height: derivedHeight })
    }
    return rects
}

function getInsertionIndex(nodes: CanvasNode[], rects: Map<string, Rect>, columnId: string, dropY: number, excludeNodeId: string): number {
    const col = nodes.find(n => n.id === columnId) as ColumnNode | undefined
    if (!col) return 0
    const order = (col.data.childOrder || []).filter(id => id !== excludeNodeId)
    for (let i = 0; i < order.length; i++) { const childRect = rects.get(order[i]); if (childRect && dropY < childRect.y + childRect.height / 2) return i }
    return order.length
}

interface SelectionBoxRect { left: number; top: number; width: number; height: number }
interface DetachingState { nodeId: string; frozenRect: Rect; originalParentId: string }

export const TakeCanvas = forwardRef<TakeCanvasHandle, TakeCanvasProps>(
    function TakeCanvas({ takeId, initialNodes, initialEdges, onNodesChange, initialUndoHistory, onUndoHistoryChange, onPromoteSelection, onDiscardSelection, shotSelections }, ref) {
        const [nodes, setNodes] = useState<CanvasNode[]>(() => initialNodes ?? [])
        const [edges, setEdges] = useState<CanvasEdge[]>(() => initialEdges ?? [])
        const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set())
        const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
        const [editingEdgeLabel, setEditingEdgeLabel] = useState<string | null>(null)
        const [interactionMode, setInteractionMode] = useState<InteractionMode>('idle')
        const [editingField, setEditingField] = useState<'title' | 'body' | null>(null)
        const [selectionBoxRect, setSelectionBoxRect] = useState<SelectionBoxRect | null>(null)
        const [connectionGhost, setConnectionGhost] = useState<{ fromX: number; fromY: number; toX: number; toY: number } | null>(null)

        // R4-005: Viewport state (NOT persisted, NOT in undo)
        const [viewport, setViewport] = useState<ViewportState>(VIEWPORT_INITIAL)
        const viewportRef = useRef<ViewportState>(VIEWPORT_INITIAL)
        useEffect(() => { viewportRef.current = viewport }, [viewport])
        const spaceDownRef = useRef(false)
        const panRef = useRef<{ startMouseX: number; startMouseY: number; startOffsetX: number; startOffsetY: number } | null>(null)

        const detachingRef = useRef<DetachingState | null>(null)
        const detachingOffsetRef = useRef<{ dx: number; dy: number } | null>(null)
        const [detachingOffsetState, setDetachingOffsetState] = useState<{ dx: number; dy: number } | null>(null)
        const [frozenColumnId, setFrozenColumnId] = useState<string | null>(null)
        const frozenRectsRef = useRef<Map<string, Rect> | null>(null)

        // R4.0a: Image Inspect overlay
        const [inspectImage, setInspectImage] = useState<{ src: string; naturalWidth: number; naturalHeight: number } | null>(null)

        const canvasRef = useRef<HTMLDivElement>(null)
        const dragRef = useRef<{ nodeId: string; offsets: Map<string, { startX: number; startY: number }>; startMouseX: number; startMouseY: number; hasMoved: boolean } | null>(null)
        const resizeRef = useRef<{ nodeId: string; startWidth: number; startHeight: number; startMouseX: number; startMouseY: number; aspectRatio: number | null } | null>(null)
        const selBoxRef = useRef<{ startX: number; startY: number; canvasRect: DOMRect } | null>(null)
        const connectionRef = useRef<{ fromNodeId: string; startX: number; startY: number; canvasRect: DOMRect } | null>(null)

        const shiftedNodesRef = useRef<Map<string, Map<string, number>>>(new Map())
        const dataChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

        const nodesRef = useRef<CanvasNode[]>(nodes); useEffect(() => { nodesRef.current = nodes }, [nodes])
        const edgesRef = useRef<CanvasEdge[]>(edges); useEffect(() => { edgesRef.current = edges }, [edges])
        const selectedNodeIdsRef = useRef<Set<string>>(selectedNodeIds); useEffect(() => { selectedNodeIdsRef.current = selectedNodeIds }, [selectedNodeIds])
        const primarySelectedId = selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null

        // Blocco 4C: Rehydrate selection badges from DB on mount
        // Two-way sync: ADD badges for active selections, STRIP stale badges from snapshot
        const selectionsAppliedRef = useRef(false)
        useEffect(() => {
            if (selectionsAppliedRef.current) return
            selectionsAppliedRef.current = true

            const activeIds = new Set((shotSelections ?? []).map(s => s.selectionId))

            setNodes(prev => {
                let changed = false
                const next = prev.map(n => {
                    if (n.type !== 'image') return n
                    const nodeData = n.data as any

                    // Strip stale: node has badge but selection is no longer active
                    if (nodeData.promotedSelectionId && !activeIds.has(nodeData.promotedSelectionId)) {
                        changed = true
                        const { promotedSelectionId: _, selectionNumber: __, ...rest } = nodeData
                        return { ...n, data: rest }
                    }

                    // Add missing: active selection matches this image but no badge yet
                    if (!nodeData.promotedSelectionId && shotSelections?.length) {
                        const match = shotSelections.find(s =>
                            s.storagePath === nodeData.storage_path ||
                            s.src === nodeData.src
                        )
                        if (match) {
                            changed = true
                            return { ...n, data: { ...nodeData, promotedSelectionId: match.selectionId, selectionNumber: match.selectionNumber } }
                        }
                    }

                    return n
                })
                return changed ? next : prev
            })
        }, [shotSelections])

        const setDetachingOffset = useCallback((val: { dx: number; dy: number } | null) => {
            detachingOffsetRef.current = val; setDetachingOffsetState(val)
        }, [])

        // R4-005: Helper — get world coords from mouse event
        const mouseToWorld = useCallback((e: MouseEvent | React.MouseEvent): { x: number; y: number } => {
            const cr = canvasRef.current?.getBoundingClientRect()
            if (!cr) return { x: 0, y: 0 }
            return screenToWorld(e.clientX - cr.left, e.clientY - cr.top, viewportRef.current)
        }, [])

        const baseRenderRects = useMemo(() => computeRenderRects(nodes, frozenColumnId, frozenRectsRef.current), [nodes, frozenColumnId])
        const renderRects = useMemo(() => {
            if (!detachingRef.current || !detachingOffsetState) return baseRenderRects
            const d = detachingRef.current, result = new Map(baseRenderRects)
            result.set(d.nodeId, { x: d.frozenRect.x + detachingOffsetState.dx, y: d.frozenRect.y + detachingOffsetState.dy, width: d.frozenRect.width, height: d.frozenRect.height })
            return result
        }, [baseRenderRects, detachingOffsetState])

        // ── History ──
        const historyRef = useRef<UndoHistory>(initialUndoHistory ? structuredClone(initialUndoHistory) : { stack: [{ nodes: structuredClone(initialNodes ?? []), edges: structuredClone(initialEdges ?? []) }], cursor: 0 })
        const emitNodesChange = useCallback(() => { if (onNodesChange) onNodesChange(structuredClone(nodesRef.current), structuredClone(edgesRef.current)) }, [onNodesChange])
        const emitHistoryChange = useCallback(() => { if (onUndoHistoryChange) onUndoHistoryChange(structuredClone(historyRef.current)) }, [onUndoHistoryChange])
        const pushHistory = useCallback(() => {
            const h = historyRef.current; h.stack = h.stack.slice(0, h.cursor + 1)
            h.stack.push({ nodes: structuredClone(nodesRef.current), edges: structuredClone(edgesRef.current) })
            if (h.stack.length > HISTORY_MAX) h.stack.shift(); else h.cursor++; emitHistoryChange()
        }, [emitHistoryChange])
        const undo = useCallback(() => {
            const h = historyRef.current; if (h.cursor <= 0) return
            // Snapshot BEFORE undo (current state in history)
            const beforeNodes = h.stack[h.cursor]?.nodes ?? []
            h.cursor--
            const p = structuredClone(h.stack[h.cursor])
            setNodes(p.nodes); setEdges(p.edges); emitHistoryChange(); setTimeout(emitNodesChange, 0)
            // Blocco 4C: detect selections lost by THIS undo step only.
            // Fires only here (not on redo, take switch, restore, or seed).
            if (onDiscardSelection) {
                const afterSelections = new Set<string>()
                for (const n of p.nodes) {
                    if ((n as any).type === 'image' && (n as any).data?.promotedSelectionId) {
                        afterSelections.add((n as any).data.promotedSelectionId)
                    }
                }
                for (const n of beforeNodes) {
                    const sid = (n as any).type === 'image' ? (n as any).data?.promotedSelectionId : undefined
                    if (sid && !afterSelections.has(sid)) {
                        onDiscardSelection(sid, 'undo').catch(console.error)
                    }
                }
            }
        }, [emitNodesChange, emitHistoryChange, onDiscardSelection])
        const redo = useCallback(() => { const h = historyRef.current; if (h.cursor >= h.stack.length - 1) return; h.cursor++; const n = structuredClone(h.stack[h.cursor]); setNodes(n.nodes); setEdges(n.edges); emitHistoryChange(); setTimeout(emitNodesChange, 0) }, [emitNodesChange, emitHistoryChange])

        // ── R4-005: Zoom (Ctrl+Wheel) + R4-005b: Trackpad Pan (plain Wheel) ──
        useEffect(() => {
            const el = canvasRef.current; if (!el) return
            const handleWheel = (e: WheelEvent) => {
                // Ctrl/Meta + Wheel = Zoom (trackpad pinch also sends ctrlKey)
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault()
                    const cr = el.getBoundingClientRect()
                    const screenX = e.clientX - cr.left
                    const screenY = e.clientY - cr.top
                    const delta = -e.deltaY * 0.01
                    const vp = viewportRef.current
                    const newScale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, vp.scale + delta))
                    if (newScale === vp.scale) return
                    setViewport(zoomAtPoint(vp, screenX, screenY, newScale))
                    return
                }

                // R4-005b: Plain wheel (two-finger trackpad swipe) = Pan
                e.preventDefault()
                const vp = viewportRef.current
                setViewport({
                    ...vp,
                    offsetX: vp.offsetX - e.deltaX,
                    offsetY: vp.offsetY - e.deltaY,
                })
            }
            el.addEventListener('wheel', handleWheel, { passive: false })
            return () => el.removeEventListener('wheel', handleWheel)
        }, [])

        // ── Create ──
        const createNodeAt = useCallback((x: number, y: number) => {
            // x, y are expected in WORLD coordinates (caller converts if needed)
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

        // Blocco 4 — Create Prompt Node (Memory Node)
        // Default promptType/origin assigned ONLY at creation time.
        const createPromptNodeAt = useCallback((x: number, y: number) => {
            const n: PromptNode = { id: crypto.randomUUID(), type: 'prompt', x: Math.round(x - PROMPT_DEFAULT_WIDTH / 2), y: Math.round(y - PROMPT_DEFAULT_HEIGHT / 2), width: PROMPT_DEFAULT_WIDTH, height: PROMPT_DEFAULT_HEIGHT, zIndex: nodesRef.current.length + 1, data: { body: '', promptType: 'prompt', origin: 'manual', createdAt: new Date().toISOString() } }
            setNodes(p => [...p, n]); setSelectedNodeIds(new Set([n.id])); setSelectedEdgeId(null); setEditingEdgeLabel(null); setInteractionMode('idle')
            setTimeout(() => { pushHistory(); emitNodesChange() }, 0)
        }, [pushHistory, emitNodesChange])

        // Screen-coordinate delegates: convert screen → world, then call world-coordinate creators.
        // Encapsulates viewport knowledge inside TakeCanvas. Sidebar never sees viewport.
        const screenToWorldCoord = useCallback((screenX: number, screenY: number) => {
            return screenToWorld(screenX, screenY, viewportRef.current)
        }, [])

        const createNodeAtScreen = useCallback((sx: number, sy: number) => {
            const w = screenToWorldCoord(sx, sy); createNodeAt(w.x, w.y)
        }, [screenToWorldCoord, createNodeAt])

        const createImageNodeAtScreen = useCallback((sx: number, sy: number, imgData: ImageData) => {
            const w = screenToWorldCoord(sx, sy); createImageNodeAt(w.x, w.y, imgData)
        }, [screenToWorldCoord, createImageNodeAt])

        const createColumnNodeAtScreen = useCallback((sx: number, sy: number) => {
            const w = screenToWorldCoord(sx, sy); createColumnNodeAt(w.x, w.y)
        }, [screenToWorldCoord, createColumnNodeAt])

        const createPromptNodeAtScreen = useCallback((sx: number, sy: number) => {
            const w = screenToWorldCoord(sx, sy); createPromptNodeAt(w.x, w.y)
        }, [screenToWorldCoord, createPromptNodeAt])

        useImperativeHandle(ref, () => ({
            getSnapshot: () => ({ nodes: structuredClone(nodes), edges: structuredClone(edges) }),
            createNodeAt, createImageNodeAt, createColumnNodeAt, createPromptNodeAt,
            createNodeAtScreen, createImageNodeAtScreen, createColumnNodeAtScreen, createPromptNodeAtScreen,
            getCanvasRect: () => canvasRef.current?.getBoundingClientRect() ?? null,
        }), [nodes, edges, createNodeAt, createImageNodeAt, createColumnNodeAt, createPromptNodeAt, createNodeAtScreen, createImageNodeAtScreen, createColumnNodeAtScreen, createPromptNodeAtScreen])

        useEffect(() => {
            setSelectedNodeIds(new Set()); setSelectedEdgeId(null); setEditingEdgeLabel(null); setInteractionMode('idle'); setEditingField(null)
            dragRef.current = null; resizeRef.current = null; selBoxRef.current = null; connectionRef.current = null
            detachingRef.current = null; setDetachingOffset(null); setFrozenColumnId(null); frozenRectsRef.current = null
            shiftedNodesRef.current = new Map()
            if (dataChangeTimerRef.current) { clearTimeout(dataChangeTimerRef.current); dataChangeTimerRef.current = null }
            setViewport(VIEWPORT_INITIAL) // Reset viewport on Take change
            setSelectionBoxRect(null); setConnectionGhost(null)
        }, [takeId])

        // ── Content measured ──
        const handleContentMeasured = useCallback((nodeId: string, measuredHeight: number) => {
            const node = nodesRef.current.find(n => n.id === nodeId)
            if (!node || (node.type !== 'note' && node.type !== 'prompt')) return
            if (!(node.data as any).parentId) return
            const rounded = Math.ceil(measuredHeight)
            if (Math.abs(node.height - rounded) < 1) return
            setNodes(p => p.map(n => n.id === nodeId ? { ...n, height: rounded } : n))
        }, [])

        // ============================================
        // DRAG (R4-005: delta converted to world space)
        // ============================================
        const handleWindowMouseMove = useCallback((e: MouseEvent) => {
            // R4-005: Pan mode (Space + Drag)
            if (panRef.current) {
                const dx = e.clientX - panRef.current.startMouseX
                const dy = e.clientY - panRef.current.startMouseY
                setViewport({
                    ...viewportRef.current,
                    offsetX: panRef.current.startOffsetX + dx,
                    offsetY: panRef.current.startOffsetY + dy,
                })
                return
            }

            if (!dragRef.current) return
            const screenDx = e.clientX - dragRef.current.startMouseX
            const screenDy = e.clientY - dragRef.current.startMouseY
            if (!dragRef.current.hasMoved && Math.hypot(screenDx, screenDy) > DRAG_THRESHOLD) { dragRef.current.hasMoved = true; setInteractionMode('dragging') }
            if (!dragRef.current.hasMoved) return
            e.preventDefault()

            // R4-005: Convert screen delta to world delta
            const { dx, dy } = screenDeltaToWorld(screenDx, screenDy, viewportRef.current.scale)

            if (detachingRef.current) { setDetachingOffset({ dx, dy }); return }
            const off = dragRef.current.offsets
            setNodes(p => p.map(n => { const o = off.get(n.id); return o ? { ...n, x: o.startX + dx, y: o.startY + dy } : n }))
        }, [])

        const handleWindowMouseUp = useCallback(() => {
            window.removeEventListener('mousemove', handleWindowMouseMove)
            window.removeEventListener('mouseup', handleWindowMouseUp)

            // R4-005: End pan
            if (panRef.current) { panRef.current = null; setInteractionMode('idle'); return }

            if (!dragRef.current?.hasMoved) {
                dragRef.current = null; detachingRef.current = null; setDetachingOffset(null)
                setFrozenColumnId(null); frozenRectsRef.current = null; return
            }

            const det = detachingRef.current
            const off = detachingOffsetRef.current
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
                            const col = n as ColumnNode; let order = [...(col.data.childOrder || [])]
                            if (n.id === det.originalParentId && n.id === targetColId) { order = order.filter(id => id !== det.nodeId); order.splice(insertIdx, 0, det.nodeId); return { ...n, data: { ...n.data, childOrder: order } } }
                            if (n.id === targetColId) { order = order.filter(id => id !== det.nodeId); order.splice(insertIdx, 0, det.nodeId); return { ...n, data: { ...n.data, childOrder: order } } }
                            if (n.id === det.originalParentId && n.id !== targetColId) { return { ...n, data: { ...n.data, childOrder: order.filter(id => id !== det.nodeId) } } }
                        }
                        return n
                    })
                })
            } else {
                const ids = new Set(dragRef.current!.offsets.keys())
                setNodes(prev => {
                    let u = [...prev]
                    for (const id of ids) {
                        const rects = computeRenderRects(u, null, null)
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
                                if (n.id === tgt && n.type === 'column') { const o = [...((n as ColumnNode).data.childOrder || [])].filter(cid => cid !== id); o.splice(insertIdx, 0, id); return { ...n, data: { ...n.data, childOrder: o } } }
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

        // ── Selection box (R4-005b: threshold-based, ref-driven, zero stale closures) ──
        const selBoxRectRef = useRef<SelectionBoxRect | null>(null)
        const selBoxActiveRef = useRef(false)
        const SEL_BOX_THRESHOLD = 4

        const handleSelBoxMouseMove = useCallback((e: MouseEvent) => {
            const sb = selBoxRef.current; if (!sb) return
            e.preventDefault()
            const world = mouseToWorld(e)
            const dx = Math.abs(world.x - sb.startX), dy = Math.abs(world.y - sb.startY)

            // R4-005b: Only activate after threshold (ref-driven, no interactionMode dependency)
            if (!selBoxActiveRef.current) {
                if (dx < SEL_BOX_THRESHOLD && dy < SEL_BOX_THRESHOLD) return
                selBoxActiveRef.current = true
                setInteractionMode('selecting')
            }

            const rect: SelectionBoxRect = {
                left: Math.min(sb.startX, world.x),
                top: Math.min(sb.startY, world.y),
                width: Math.abs(world.x - sb.startX),
                height: Math.abs(world.y - sb.startY),
            }
            selBoxRectRef.current = rect
            setSelectionBoxRect(rect)
        }, [mouseToWorld])

        const handleSelBoxMouseUp = useCallback(() => {
            window.removeEventListener('mousemove', handleSelBoxMouseMove)
            window.removeEventListener('mouseup', handleSelBoxMouseUp)

            const wasActive = selBoxActiveRef.current
            const box = selBoxRectRef.current
            const additive = selBoxRef.current?.additive ?? false

            if (wasActive && box && box.width > 2 && box.height > 2) {
                // Finalize selection — synchronous
                const rects = computeRenderRects(nodesRef.current, null, null)
                // R4-005d: Start from previous selection if additive (Cmd/Ctrl)
                const sel = additive ? new Set(selectedNodeIdsRef.current) : new Set<string>()
                nodesRef.current.forEach(n => {
                    if (nodeHidden(n, nodesRef.current)) return
                    const rc = rects.get(n.id)
                    if (rc && rc.x < box.left + box.width && rc.x + rc.width > box.left
                        && rc.y < box.top + box.height && rc.y + rc.height > box.top) sel.add(n.id)
                })
                selectedNodeIdsRef.current = sel
                setSelectedNodeIds(sel)
            } else if (!additive) {
                // Click on empty canvas without modifier — clear selection
                selectedNodeIdsRef.current = new Set()
                setSelectedNodeIds(new Set())
                setSelectedEdgeId(null)
                setEditingEdgeLabel(null)
                setEditingField(null)
            }

            // Synchronous cleanup — always
            setSelectionBoxRect(null)
            selBoxRectRef.current = null
            selBoxActiveRef.current = false
            selBoxRef.current = null
            setInteractionMode('idle')
        }, [handleSelBoxMouseMove])

        useEffect(() => { return () => { window.removeEventListener('mousemove', handleSelBoxMouseMove); window.removeEventListener('mouseup', handleSelBoxMouseUp) } }, [handleSelBoxMouseMove, handleSelBoxMouseUp])

        // ── Connection (R4-005: world coords) ──
        const handleConnectionMouseMove = useCallback((e: MouseEvent) => {
            const c = connectionRef.current; if (!c) return; e.preventDefault()
            const rects = computeRenderRects(nodesRef.current, null, null); const fr = rects.get(c.fromNodeId); if (!fr) return
            // R4-005: mouse to world
            const world = mouseToWorld(e)
            const f = edgeAnchor(fr, world.x, world.y)
            setConnectionGhost({ fromX: f.x, fromY: f.y, toX: world.x, toY: world.y })
        }, [mouseToWorld])

        const handleConnectionMouseUp = useCallback((e: MouseEvent) => {
            window.removeEventListener('mousemove', handleConnectionMouseMove); window.removeEventListener('mouseup', handleConnectionMouseUp)
            const c = connectionRef.current
            if (c) {
                // R4-005: mouse to world for hit test
                const world = mouseToWorld(e)
                const rects = computeRenderRects(nodesRef.current, null, null)
                const tgt = nodesRef.current.find(n => { if (n.id === c.fromNodeId || nodeHidden(n, nodesRef.current)) return false; const r = rects.get(n.id); return r && world.x >= r.x && world.x <= r.x + r.width && world.y >= r.y && world.y <= r.y + r.height })
                if (tgt && !edgesRef.current.some(e => (e.from === c.fromNodeId && e.to === tgt.id) || (e.from === tgt.id && e.to === c.fromNodeId))) {
                    setEdges(p => [...p, { id: crypto.randomUUID(), from: c.fromNodeId, to: tgt.id }]); setTimeout(() => { pushHistory(); emitNodesChange() }, 0)
                }
            }
            connectionRef.current = null; setConnectionGhost(null); setInteractionMode('idle')
        }, [handleConnectionMouseMove, pushHistory, emitNodesChange, mouseToWorld])

        const handleConnectionStart = useCallback((nodeId: string, mx: number, my: number) => {
            const cr = canvasRef.current?.getBoundingClientRect(); if (!cr) return
            connectionRef.current = { fromNodeId: nodeId, startX: mx - cr.left, startY: mx - cr.top, canvasRect: cr }
            setInteractionMode('connecting'); setSelectedEdgeId(null); setEditingEdgeLabel(null)
            window.addEventListener('mousemove', handleConnectionMouseMove); window.addEventListener('mouseup', handleConnectionMouseUp)
        }, [handleConnectionMouseMove, handleConnectionMouseUp])
        useEffect(() => { return () => { window.removeEventListener('mousemove', handleConnectionMouseMove); window.removeEventListener('mouseup', handleConnectionMouseUp) } }, [handleConnectionMouseMove, handleConnectionMouseUp])

        // ── Resize (R4-005: delta in world space) ──
        const handleResizeMouseMove = useCallback((e: MouseEvent) => {
            if (!resizeRef.current) return; e.preventDefault()
            // R4-005: Convert screen delta to world delta
            const screenDx = e.clientX - resizeRef.current.startMouseX
            const screenDy = e.clientY - resizeRef.current.startMouseY
            const { dx, dy } = screenDeltaToWorld(screenDx, screenDy, viewportRef.current.scale)

            let nw: number, nh: number
            if (resizeRef.current.aspectRatio !== null) {
                nw = Math.max(MIN_IMAGE_SIZE, resizeRef.current.startWidth + dx); nh = nw / resizeRef.current.aspectRatio
                if (nh < MIN_IMAGE_SIZE) { nh = MIN_IMAGE_SIZE; nw = nh * resizeRef.current.aspectRatio }
            } else {
                nw = Math.max(MIN_WIDTH, resizeRef.current.startWidth + dx)
                const node = nodesRef.current.find(n => n.id === resizeRef.current!.nodeId)
                if (node?.type === 'column') { nh = node.height } else { nh = Math.max(MIN_HEIGHT, resizeRef.current.startHeight + dy) }
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

        // ============================================
        // R4-004c — VERTICAL WALL CASCADE
        // ============================================
        const handleToggleCollapse = useCallback((nodeId: string) => {
            if (detachingRef.current?.originalParentId === nodeId) return
            const currentCol = nodesRef.current.find(n => n.id === nodeId && n.type === 'column') as ColumnNode | undefined
            const isCurrentlyCollapsed = currentCol?.data.collapsed ?? false

            let collapseMemory: Map<string, number> | null = null
            if (!isCurrentlyCollapsed) {
                collapseMemory = shiftedNodesRef.current.get(nodeId) ?? null
                shiftedNodesRef.current.delete(nodeId)
            }

            setNodes(prevNodes => {
                const col = prevNodes.find(n => n.id === nodeId && n.type === 'column') as ColumnNode | undefined
                if (!col) return prevNodes
                const wasCollapsed = col.data.collapsed ?? false

                if (wasCollapsed) {
                    const toggledNodes = prevNodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, collapsed: false } } as CanvasNode : n)
                    const newRects = computeRenderRects(toggledNodes, null, null)
                    const colRect = newRects.get(nodeId)
                    if (!colRect) return toggledNodes

                    const occupiedBottom = colRect.y + colRect.height
                    const colLeft = col.x, colRight = col.x + colRect.width

                    const candidates: { id: string; y: number; height: number }[] = []
                    for (const n of toggledNodes) {
                        if (n.id === nodeId) continue
                        if ((n.data as any).parentId != null) continue
                        const nRight = n.x + n.width
                        if (nRight <= colLeft || n.x >= colRight) continue
                        if (n.y < colRect.y) continue
                        const nRect = newRects.get(n.id); const nHeight = nRect ? nRect.height : n.height
                        candidates.push({ id: n.id, y: n.y, height: nHeight })
                    }
                    candidates.sort((a, b) => a.y - b.y)

                    let currentBottom = occupiedBottom
                    const savedPositions = new Map<string, number>()
                    const newPositions = new Map<string, number>()

                    for (const el of candidates) {
                        if (el.y >= currentBottom + MIN_GAP) { currentBottom = el.y + el.height; continue }
                        savedPositions.set(el.id, el.y)
                        const newY = currentBottom + MIN_GAP
                        newPositions.set(el.id, newY)
                        currentBottom = newY + el.height
                    }

                    if (savedPositions.size > 0) shiftedNodesRef.current.set(nodeId, savedPositions)
                    if (newPositions.size === 0) return toggledNodes
                    return toggledNodes.map(n => { const newY = newPositions.get(n.id); return newY !== undefined ? { ...n, y: newY } : n })
                } else {
                    const savedPositions = collapseMemory
                    return prevNodes.map(n => {
                        if (n.id === nodeId) return { ...n, data: { ...n.data, collapsed: true } } as CanvasNode
                        if (savedPositions && savedPositions.has(n.id)) return { ...n, y: savedPositions.get(n.id)! }
                        return n
                    })
                }
            })
            setTimeout(() => { pushHistory(); emitNodesChange() }, 0)
        }, [pushHistory, emitNodesChange])

        // ── Node handlers ──
        const handleSelect = useCallback((nodeId: string, additive: boolean) => {
            let next: Set<string>
            if (additive) {
                // Cmd/Ctrl + Click: toggle node in/out of selection
                next = new Set(selectedNodeIdsRef.current)
                if (next.has(nodeId)) { next.delete(nodeId) } else { next.add(nodeId) }
            } else {
                // Plain click: replace selection (but keep multi-selection intact for drag)
                if (selectedNodeIdsRef.current.has(nodeId) && selectedNodeIdsRef.current.size > 1) return
                next = new Set([nodeId])
            }
            // R4-005d: Sync ref immediately so handlePotentialDragStart sees updated selection in same event
            selectedNodeIdsRef.current = next
            setSelectedNodeIds(next)
            setSelectedEdgeId(null); setEditingEdgeLabel(null)
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

            // R4-005d: Don't override selection — handleSelect already set it correctly
            window.addEventListener('mousemove', handleWindowMouseMove); window.addEventListener('mouseup', handleWindowMouseUp)
        }, [handleWindowMouseMove, handleWindowMouseUp])

        const handleDelete = useCallback((nodeId: string) => {
            setNodes(p => {
                const node = p.find(n => n.id === nodeId)
                const deleteIds = new Set([nodeId])
                if (node?.type === 'column') { p.forEach(n => { if ((n.data as any).parentId === nodeId) deleteIds.add(n.id) }) }
                let u = p.filter(n => !deleteIds.has(n.id))
                return u.map(n => {
                    if (n.type === 'column' && (n as ColumnNode).data.childOrder) {
                        const filtered = (n as ColumnNode).data.childOrder!.filter(id => !deleteIds.has(id))
                        if (filtered.length !== (n as ColumnNode).data.childOrder!.length) return { ...n, data: { ...n.data, childOrder: filtered } }
                    }
                    return n
                })
            })
            setEdges(p => {
                const node = nodesRef.current.find(n => n.id === nodeId)
                const deleteIds = new Set([nodeId])
                if (node?.type === 'column') { nodesRef.current.forEach(n => { if ((n.data as any).parentId === nodeId) deleteIds.add(n.id) }) }
                return p.filter(e => !deleteIds.has(e.from) && !deleteIds.has(e.to))
            })
            setSelectedNodeIds(new Set()); setSelectedEdgeId(null); setEditingEdgeLabel(null); setInteractionMode('idle'); setEditingField(null)
            setTimeout(() => { pushHistory(); emitNodesChange() }, 0)
        }, [pushHistory, emitNodesChange])

        const handleStartEditing = useCallback((nodeId: string, field: 'title' | 'body') => { setSelectedNodeIds(new Set([nodeId])); setSelectedEdgeId(null); setEditingEdgeLabel(null); setInteractionMode('editing'); setEditingField(field) }, [])
        const handleFieldFocus = useCallback((f: 'title' | 'body') => setEditingField(f), [])
        // Flush: on blur, commit any pending debounced history immediately.
        // emitNodesChange already fired immediately in handleDataChange — only pushHistory needs flush.
        const handleFieldBlur = useCallback(() => {
            if (dataChangeTimerRef.current) { clearTimeout(dataChangeTimerRef.current); dataChangeTimerRef.current = null; pushHistory() }
            setInteractionMode('idle'); setEditingField(null)
        }, [pushHistory])
        // Debounced history push: groups rapid keystrokes into single undo steps (like Word/Figma).
        // CRITICAL: pushHistory is debounced (operator), emitNodesChange fires immediately (memory/persist).
        // Persist and undo are separate concerns — memory must never depend on debounce.
        const DATA_CHANGE_DEBOUNCE = 500
        const handleDataChange = useCallback((nodeId: string, data: NoteData | ColumnData | PromptData) => {
            setNodes(p => p.map(n => n.id === nodeId ? { ...n, data: data as any } : n))
            emitNodesChange()
            if (dataChangeTimerRef.current) clearTimeout(dataChangeTimerRef.current)
            dataChangeTimerRef.current = setTimeout(() => { dataChangeTimerRef.current = null; pushHistory() }, DATA_CHANGE_DEBOUNCE)
        }, [pushHistory, emitNodesChange])

        // ── Edge click (R4-005: world coords) ──
        const handleSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
            // R4-005: mouse to world for edge hit test
            const world = mouseToWorld(e)
            let best: CanvasEdge | null = null, bd = EDGE_HIT_DISTANCE / viewportRef.current.scale
            edgesRef.current.forEach(edge => {
                const fn = nodesRef.current.find(n => n.id === edge.from), tn = nodesRef.current.find(n => n.id === edge.to)
                if (!fn || !tn || nodeHidden(fn, nodesRef.current) || nodeHidden(tn, nodesRef.current)) return
                const fr = renderRects.get(edge.from), tr = renderRects.get(edge.to); if (!fr || !tr) return
                const a = edgeAnchor(fr, rectCenter(tr).x, rectCenter(tr).y), b = edgeAnchor(tr, rectCenter(fr).x, rectCenter(fr).y)
                const d = distToSeg(world.x, world.y, a.x, a.y, b.x, b.y); if (d < bd) { bd = d; best = edge }
            })
            if (best) { e.stopPropagation(); setSelectedEdgeId(best.id); setEditingEdgeLabel(null); setSelectedNodeIds(new Set()) }
        }, [renderRects, mouseToWorld])

        // ── Canvas mousedown (R4-005: pan or selection box) ──
        const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
            if (interactionMode === 'editing') return

            // R4-005: Space + Click or Middle Mouse = Pan
            if (spaceDownRef.current || e.button === 1) {
                e.preventDefault()
                panRef.current = {
                    startMouseX: e.clientX,
                    startMouseY: e.clientY,
                    startOffsetX: viewportRef.current.offsetX,
                    startOffsetY: viewportRef.current.offsetY,
                }
                setInteractionMode('panning')
                window.addEventListener('mousemove', handleWindowMouseMove)
                window.addEventListener('mouseup', handleWindowMouseUp)
                return
            }

            // R4-005b: Selection box — stay idle, register listeners.
            // Mode changes to 'selecting' only after mousemove exceeds threshold.
            // R4-005d: Capture additive flag for union vs replace on mouseup.
            const world = mouseToWorld(e)
            selBoxRef.current = { startX: world.x, startY: world.y, canvasRect: canvasRef.current!.getBoundingClientRect(), additive: e.metaKey || e.ctrlKey }
            selBoxRectRef.current = null
            selBoxActiveRef.current = false
            // Don't clear selection yet — that happens on mouseup if it was just a click
            // Don't setInteractionMode('selecting') — that happens on threshold in mousemove
            window.addEventListener('mousemove', handleSelBoxMouseMove); window.addEventListener('mouseup', handleSelBoxMouseUp)
        }, [interactionMode, handleSelBoxMouseMove, handleSelBoxMouseUp, handleWindowMouseMove, handleWindowMouseUp, mouseToWorld])

        // R4-005b: Failsafe — reset interaction mode + clean up all refs
        // Catches stuck states from mouseup outside canvas, lost focus, etc.
        const endInteraction = useCallback(() => {
            if (dragRef.current) {
                window.removeEventListener('mousemove', handleWindowMouseMove)
                window.removeEventListener('mouseup', handleWindowMouseUp)
                dragRef.current = null
            }
            if (panRef.current) { panRef.current = null }
            if (selBoxRef.current) {
                window.removeEventListener('mousemove', handleSelBoxMouseMove)
                window.removeEventListener('mouseup', handleSelBoxMouseUp)
                selBoxRef.current = null; selBoxRectRef.current = null; selBoxActiveRef.current = false; setSelectionBoxRect(null)
            }
            if (connectionRef.current) {
                window.removeEventListener('mousemove', handleConnectionMouseMove)
                window.removeEventListener('mouseup', handleConnectionMouseUp)
                connectionRef.current = null; setConnectionGhost(null)
            }
            if (resizeRef.current) {
                window.removeEventListener('mousemove', handleResizeMouseMove)
                window.removeEventListener('mouseup', handleResizeMouseUp)
                resizeRef.current = null
            }
            detachingRef.current = null; setDetachingOffset(null)
            setFrozenColumnId(null); frozenRectsRef.current = null
            setInteractionMode('idle')
        }, [handleWindowMouseMove, handleWindowMouseUp, handleSelBoxMouseMove, handleSelBoxMouseUp, handleConnectionMouseMove, handleConnectionMouseUp, handleResizeMouseMove, handleResizeMouseUp, setDetachingOffset])

        // R4-005b: Window blur failsafe — if user switches tab/window mid-interaction
        useEffect(() => {
            const handleBlur = () => { endInteraction() }
            window.addEventListener('blur', handleBlur)
            return () => window.removeEventListener('blur', handleBlur)
        }, [endInteraction])

        // ── Keyboard (Space for pan, Undo/Redo, Delete) ──
        // R4-005b: Positioned after endInteraction to avoid TDZ.
        //          Space keyup calls endInteraction() — single reset path.
        useEffect(() => {
            const kd = (e: KeyboardEvent) => {
                if (e.code === 'Space' && !e.repeat) {
                    const a = document.activeElement
                    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return
                    e.preventDefault()
                    spaceDownRef.current = true
                }
                const mod = e.metaKey || e.ctrlKey
                if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
                if (mod && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo() }
                if (e.key === 'Escape') { endInteraction(); setSelectedNodeIds(new Set()); setSelectedEdgeId(null); setEditingEdgeLabel(null); setEditingField(null) }
                if ((e.key === 'Delete' || e.key === 'Backspace') && interactionMode === 'idle') {
                    const a = document.activeElement; if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return
                    if (selectedEdgeId) { e.preventDefault(); setEdges(p => p.filter(ed => ed.id !== selectedEdgeId)); setSelectedEdgeId(null); setEditingEdgeLabel(null); setTimeout(() => { pushHistory(); emitNodesChange() }, 0); return }
                    if (selectedNodeIdsRef.current.size > 0) {
                        e.preventDefault(); const del = new Set(selectedNodeIdsRef.current)
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
            const ku = (e: KeyboardEvent) => {
                if (e.code === 'Space') {
                    spaceDownRef.current = false
                    // R4-005b: Single reset path via endInteraction
                    if (panRef.current) endInteraction()
                }
            }
            window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)
            return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku) }
        }, [undo, redo, selectedEdgeId, interactionMode, pushHistory, emitNodesChange, endInteraction])

        // ── Blocco 4C: Shot Selection Promotion ──
        const handlePromoteSelectedImage = useCallback(async () => {
            if (!onPromoteSelection) return
            if (!primarySelectedId || selectedNodeIds.size !== 1) return
            const imageNode = nodesRef.current.find(n => n.id === primarySelectedId && n.type === 'image') as ImageNode | undefined
            if (!imageNode) return
            if (imageNode.data.promotedSelectionId) return // already promoted

            // Best-effort: find connected PromptNode via edges
            let promptData: { body: string; promptType: string; origin: string; createdAt?: string } | null = null
            const connectedEdge = edgesRef.current.find(e => e.to === imageNode.id || e.from === imageNode.id)
            if (connectedEdge) {
                const promptId = connectedEdge.from === imageNode.id ? connectedEdge.to : connectedEdge.from
                const promptNode = nodesRef.current.find(n => n.id === promptId && n.type === 'prompt') as PromptNode | undefined
                if (promptNode?.data.body) {
                    promptData = {
                        body: promptNode.data.body,
                        promptType: promptNode.data.promptType ?? 'prompt',
                        origin: promptNode.data.origin ?? 'manual',
                        createdAt: promptNode.data.createdAt,
                    }
                }
            }

            const result = await onPromoteSelection(imageNode.id, imageNode.data, promptData)
            if (!result) return

            pushHistory()
            setNodes(prev => prev.map(n =>
                n.id === imageNode.id && n.type === 'image'
                    ? { ...n, data: { ...n.data, promotedSelectionId: result.selectionId, selectionNumber: result.selectionNumber } }
                    : n
            ))
            emitNodesChange()
        }, [onPromoteSelection, primarySelectedId, selectedNodeIds, pushHistory, emitNodesChange])

        const handleRemoveBadge = useCallback(async (nodeId: string) => {
            const node = nodesRef.current.find(n => n.id === nodeId && n.type === 'image') as ImageNode | undefined
            if (!node?.data.promotedSelectionId) return
            const selectionId = node.data.promotedSelectionId

            if (!onDiscardSelection) return
            try {
                await onDiscardSelection(selectionId, 'manual')
            } catch (err) {
                console.error('Failed to discard selection:', err)
            }

            // 2. Then update UI
            pushHistory()
            setNodes(prev => prev.map(n =>
                n.id === nodeId && n.type === 'image'
                    ? { ...n, data: { ...n.data, promotedSelectionId: undefined, selectionNumber: undefined } }
                    : n
            ))
            emitNodesChange()
        }, [pushHistory, emitNodesChange, onDiscardSelection])

        // R4-005: Double-click canvas = reset viewport
        // R4-005b: Only on truly empty canvas — not on nodes, columns, or their children
        const handleCanvasDoubleClick = useCallback((e: React.MouseEvent) => {
            const target = e.target as HTMLElement
            // Block if clicking on a node or anything inside a node
            if (target.closest('[data-node-shell]')) return
            // Block if clicking on interactive elements (buttons, inputs)
            if (target.closest('button') || target.closest('input') || target.closest('textarea')) return
            setViewport(VIEWPORT_INITIAL)
        }, [])

        const visibleNodes = nodes.filter(n => !nodeHidden(n, nodes))
        const edgeLines = useMemo(() => edges.map(edge => {
            const fn = nodes.find(n => n.id === edge.from), tn = nodes.find(n => n.id === edge.to)
            if (!fn || !tn || nodeHidden(fn, nodes) || nodeHidden(tn, nodes)) return null
            const fr = renderRects.get(edge.from), tr = renderRects.get(edge.to); if (!fr || !tr) return null
            const fc = rectCenter(fr), tc = rectCenter(tr)
            return { edge, from: edgeAnchor(fr, tc.x, tc.y), to: edgeAnchor(tr, fc.x, fc.y) }
        }).filter(Boolean) as { edge: CanvasEdge; from: { x: number; y: number }; to: { x: number; y: number } }[], [edges, nodes, renderRects])

        return (
            <div
                ref={canvasRef}
                className="flex-1 bg-zinc-950 relative overflow-hidden"
                style={{ cursor: spaceDownRef.current || interactionMode === 'panning' ? 'grab' : undefined }}
                onMouseDown={handleCanvasMouseDown}
                onDoubleClick={handleCanvasDoubleClick}
            >
                {/* R4.0a: Dot grid background — world space, moves with viewport */}
                <div
                    className="absolute pointer-events-none"
                    style={{
                        inset: -2000,
                        transform: `translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.scale})`,
                        transformOrigin: '0 0',
                        backgroundImage: 'radial-gradient(circle, rgba(161,161,170,0.15) 1px, transparent 1px)',
                        backgroundSize: '20px 20px',
                    }}
                />
                {/* R4-005: Viewport transform wrapper — everything inside scales/pans */}
                <div
                    style={{
                        transform: `translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.scale})`,
                        transformOrigin: '0 0',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        // No width/height — children positioned absolutely in world space
                    }}
                >
                    {/* SVG for edges — in world space */}
                    <svg className="absolute pointer-events-none" style={{ zIndex: 0, overflow: 'visible', width: 1, height: 1 }}>
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

                    {/* Edge labels — in world space */}
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

                    {/* Nodes — in world space */}
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
                                viewportScale={viewport.scale}
                                onSelect={handleSelect} onPotentialDragStart={handlePotentialDragStart}
                                onDelete={handleDelete} onResizeStart={handleResizeStart} onConnectionStart={handleConnectionStart}>
                                {node.type === 'note' ? <NoteContent data={node.data} isEditing={interactionMode === 'editing' && node.id === primarySelectedId} editingField={node.id === primarySelectedId ? editingField : null} onDataChange={d => handleDataChange(node.id, d)} onFieldFocus={handleFieldFocus} onFieldBlur={handleFieldBlur} onStartEditing={f => handleStartEditing(node.id, f)} onRequestHeight={h => handleRequestHeight(node.id, h)} onContentMeasured={h => handleContentMeasured(node.id, h)} />
                                    : node.type === 'image' ? <ImageContent data={node.data} isSelected={selectedNodeIds.has(node.id)} onRemoveBadge={() => handleRemoveBadge(node.id)} onInspect={() => setInspectImage({ src: node.data.src, naturalWidth: node.data.naturalWidth, naturalHeight: node.data.naturalHeight })} />
                                        : node.type === 'prompt' ? <PromptContent data={node.data} isEditing={interactionMode === 'editing' && node.id === primarySelectedId} editingField={node.id === primarySelectedId ? editingField : null} onDataChange={d => handleDataChange(node.id, d)} onStartEditing={f => handleStartEditing(node.id, f)} onFieldBlur={handleFieldBlur} onRequestHeight={h => handleRequestHeight(node.id, h)} onContentMeasured={h => handleContentMeasured(node.id, h)} />
                                            : <ColumnContent data={node.data} isEditing={interactionMode === 'editing' && node.id === primarySelectedId} editingField={node.id === primarySelectedId ? editingField : null} onDataChange={d => handleDataChange(node.id, d)} onFieldBlur={handleFieldBlur} onStartEditing={f => handleStartEditing(node.id, f)} onToggleCollapse={() => handleToggleCollapse(node.id)} />}
                            </NodeShell>
                        )
                    })}

                    {/* Selection box — in world space */}
                    {selectionBoxRect && selectionBoxRect.width > 2 && selectionBoxRect.height > 2 && (
                        <div data-selection-box className="absolute border border-blue-500 bg-blue-500/10 pointer-events-none z-[9998]" style={{ left: selectionBoxRect.left, top: selectionBoxRect.top, width: selectionBoxRect.width, height: selectionBoxRect.height }} />
                    )}

                    {/* Blocco 4C: Selection Promote button — world space, under selected ImageNode */}
                    {onPromoteSelection && primarySelectedId && interactionMode === 'idle' && (() => {
                        const node = nodes.find(n => n.id === primarySelectedId)
                        if (!node || node.type !== 'image') return null
                        if ((node.data as any).promotedSelectionId) return null // already promoted
                        const rect = renderRects.get(primarySelectedId)
                        if (!rect) return null
                        const s = 1 / viewport.scale
                        return (
                            <div
                                className="absolute z-[9997] pointer-events-auto"
                                style={{ left: rect.x + rect.width / 2, top: rect.y + rect.height + 8 * s, transform: `translateX(-50%) scale(${s})`, transformOrigin: 'top center' }}
                            >
                                <button
                                    onClick={(e) => { e.stopPropagation(); handlePromoteSelectedImage() }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className="px-2 py-0.5 bg-zinc-800 border border-zinc-600 hover:border-zinc-400 text-zinc-400 hover:text-zinc-200 text-[10px] rounded whitespace-nowrap transition-colors"
                                >
                                    Select as Asset
                                </button>
                            </div>
                        )
                    })()}
                </div>

                {/* Empty state — outside viewport transform */}
                {nodes.length === 0 && edges.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><p className="text-zinc-600 text-sm">Drag "Note" or "Image" from sidebar to canvas</p></div>
                )}

                {/* R4-005: Zoom indicator — outside viewport transform */}
                {viewport.scale !== 1 && (
                    <div className="absolute bottom-3 right-3 text-zinc-500 text-xs bg-zinc-900/80 px-2 py-1 rounded pointer-events-none z-[9999]">
                        {Math.round(viewport.scale * 100)}%
                    </div>
                )}

                {/* R4.0a: Image Inspect Overlay */}
                {inspectImage && (
                    <ImageInspectOverlay
                        src={inspectImage.src}
                        naturalWidth={inspectImage.naturalWidth}
                        naturalHeight={inspectImage.naturalHeight}
                        onClose={() => setInspectImage(null)}
                    />
                )}
            </div>
        )
    })