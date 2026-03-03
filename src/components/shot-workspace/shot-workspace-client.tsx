'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ShotHeader } from './shot-header'
import { TakeTabs } from './take-tabs'
import { TakeCanvas, type TakeCanvasHandle, type CanvasNode, type CanvasEdge, type UndoHistory } from '@/components/canvas/TakeCanvas'
import { VIEWPORT_INITIAL, type ViewportState } from '@/utils/screenToWorld'
import type { ImageData, VideoData } from '@/components/canvas/NodeContent'
import {
  saveTakeSnapshotAction,
  loadLatestTakeSnapshotAction,
} from '@/app/actions/take-snapshots'
import { createTakeAction } from '@/app/actions/takes'
import { setShotFinalVisualAction, getShotFinalVisualAction, clearShotFinalVisualAction } from '@/app/actions/shot-final-visual'
import {
  approveTakeAction,
  revokeTakeAction,
  deleteTakeWithGuardAction,
} from '@/app/actions/shot-approved-take'
import { setTakeOutputVideo, clearTakeOutputVideo } from '@/app/actions/take-output'
import { setShotOutputVideo, clearShotOutputVideo } from '@/app/actions/shot-output'
import { getShotMediaRatings, setShotMediaRating } from '@/app/actions/shot-media-ratings'
import { ExportTakeModal } from '@/components/export/export-take-modal'
import { ProductionLaunchPanel } from '@/components/production/production-launch-panel'
import { createClient } from '@/lib/supabase/client'
import { SceneShotStrip, setLastTakeForShot, type StripScene, type StripShot } from './scene-shot-strip'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { InspectorPanel } from '@/components/inspector/inspector-panel'
import { invalidateEntityCache, bumpEntityVersion } from '@/lib/entities/entity-cache'
import { EntityLibrary } from '@/components/entities/entity-library-v3'
import { CrystallizeModal } from '@/components/entities/crystallize-modal'
import { EntityEditOverlay } from '@/components/entities/entity-edit-overlay'

import { crystallizeEntityAction, getEntityAction } from '@/app/actions/entities'
import type { Entity } from '@/app/actions/entities'

// ===================================================
// SHOT WORKSPACE CLIENT — ORCHESTRATOR (R4-003)
// ===================================================

// Upload limit: configurable via env, fallback 50MB (Supabase Free plan)
const MAX_UPLOAD_BYTES = (parseInt(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? '50', 10)) * 1024 * 1024
const MAX_UPLOAD_LABEL = `${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}MB`

/** Returns error message if file exceeds limit, null if OK */
function checkFileSize(file: File): string | null {
  if (file.size > MAX_UPLOAD_BYTES) {
    return `File "${file.name}" (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds the ${MAX_UPLOAD_LABEL} upload limit.`
  }
  return null
}

/** Normalize column containment: repair parentId ↔ childOrder invariant.
 *  Pure function — returns new array only if repairs were needed. */
function normalizeColumnContainment(nodes: CanvasNode[]): CanvasNode[] {
  const nodeIds = new Set(nodes.map(n => n.id))
  const colMap = new Map<string, CanvasNode>()
  for (const n of nodes) { if (n.type === 'column') colMap.set(n.id, n) }

  // Build actual children set per column from parentId
  const childrenOf = new Map<string, Set<string>>()
  for (const col of colMap.keys()) childrenOf.set(col, new Set())
  for (const n of nodes) {
    if (n.type === 'column') continue
    const pid = (n.data as any)?.parentId
    if (pid && colMap.has(pid)) childrenOf.get(pid)!.add(n.id)
    if (n.type === 'image') console.log('[NORM img]', n.id.slice(0, 8), 'parentId=', pid ?? 'null')
  }

  let dirty = false
  const result = nodes.map(n => {
    if (n.type === 'column') {
      const col = n as any
      const rawOrder: string[] = col.data?.childOrder ?? []
      const actualChildren = childrenOf.get(n.id)!
      // Remove ids not in actual children or not existing
      const cleaned = rawOrder.filter(id => actualChildren.has(id) && nodeIds.has(id))
      // Dedupe
      const seen = new Set<string>()
      const deduped: string[] = []
      for (const id of cleaned) { if (!seen.has(id)) { seen.add(id); deduped.push(id) } }
      // Append children with parentId but missing from childOrder
      for (const cid of actualChildren) { if (!seen.has(cid)) { seen.add(cid); deduped.push(cid) } }
      if (deduped.length !== rawOrder.length || deduped.some((id, i) => id !== rawOrder[i])) {
        dirty = true
        return { ...n, data: { ...n.data, childOrder: deduped } }
      }
      return n
    }
    // Non-column: if parentId points to non-existent column, clear it
    const pid = (n.data as any)?.parentId
    if (pid && !colMap.has(pid)) {
      dirty = true
      return { ...n, data: { ...n.data, parentId: null } }
    }
    return n
  })
  return dirty ? result : nodes
}

/** Pre-generate deterministic storage path + public URL before upload starts.
 *  This ensures the node always has a valid storage_path, even if persist happens mid-upload. */
function precomputeMediaPath(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  shotId: string,
  file: File,
  type: 'image' | 'video',
) {
  const ext = file.name.split('.').pop() || (type === 'image' ? 'png' : 'mp4')
  const storagePath = `${projectId}/${shotId}/${crypto.randomUUID()}.${ext}`
  const bucket = type === 'image' ? 'take-images' : 'take-videos'
  const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath)
  return { storagePath, bucket, publicUrl: data?.publicUrl ?? '' }
}

interface Shot {
  id: string
  order_index: number
  project_id: string
  scene_id: string
  status: string
  technical_notes: string | null
  visual_description: string
  created_at: string
  updated_at: string
  approved_take_id: string | null
}

interface Take {
  id: string
  shot_id: string
  name: string
  description: string | null
  status: string
  order_index: number
  take_number: number
  created_at: string
  updated_at: string
  output_video_node_id: string | null
}

interface StripData {
  scenes: StripScene[]
  currentSceneId: string
  sceneShots: StripShot[]
}

interface ShotWorkspaceClientProps {
  shot: Shot
  takes: Take[]
  projectId: string
  stripData?: StripData
}

interface SnapshotPayload {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

export function ShotWorkspaceClient({ shot, takes: initialTakes, projectId, stripData }: ShotWorkspaceClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [takes, setTakes] = useState<Take[]>(initialTakes)

  const takeFromUrl = searchParams.get('take')
  const defaultTakeId = (takeFromUrl && takes.some(t => t.id === takeFromUrl))
    ? takeFromUrl
    : (takes.length > 0 ? takes[0].id : null)
  const [currentTakeId, setCurrentTakeId] = useState<string | null>(defaultTakeId)

  useEffect(() => {
    if (!currentTakeId) return
    const current = searchParams.get('take')
    if (current !== currentTakeId) {
      router.replace(`?take=${currentTakeId}`, { scroll: false })
    }
    // Record last active take for this shot (session memory for strip nav)
    setLastTakeForShot(shot.id, currentTakeId)
  }, [currentTakeId, searchParams, router, shot.id])

  const canvasRef = useRef<TakeCanvasHandle>(null)

  const [readyTakeId, setReadyTakeId] = useState<string | null>(null)
  const [readyPayload, setReadyPayload] = useState<SnapshotPayload | undefined>(undefined)
  // Live nodes ref for Inspector: updated on every canvas change, read-only consumption
  const liveNodesRef = useRef<CanvasNode[]>([])

  // Viewport persist: restore from sessionStorage, driven only by readyTakeId
  const readyViewport = useMemo<ViewportState>(() => {
    if (!readyTakeId) return VIEWPORT_INITIAL
    try {
      const raw = sessionStorage.getItem(`cineboard:viewport:take:${readyTakeId}`)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (typeof parsed.offsetX === 'number' && typeof parsed.offsetY === 'number' && typeof parsed.scale === 'number') {
          return parsed
        }
      }
    } catch { }
    return VIEWPORT_INITIAL
  }, [readyTakeId]) // eslint-disable-line react-hooks/exhaustive-deps
  const [isLoading, setIsLoading] = useState(true)
  const [finalVisual, setFinalVisual] = useState<{ nodeId: string; takeId: string } | null>(null)
  const [resolvedFv, setResolvedFv] = useState<{ src: string; storagePath: string } | null>(null)

  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [inspectMedia, setInspectMedia] = useState<{ type: 'image' | 'video'; src: string } | null>(null)
  const [ratingMap, setRatingMap] = useState<Record<string, number>>({})
  const [confirmState, setConfirmState] = useState<{
    title: string; body: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; onConfirm: () => void
  } | null>(null)

  // ESC to close inspect overlay
  useEffect(() => {
    if (!inspectMedia) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setInspectMedia(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [inspectMedia])

  // Resolve FV src from take snapshot (local or remote)
  const resolvedFvSeqRef = useRef(0)
  useEffect(() => {
    if (!finalVisual) { setResolvedFv(null); return }
    const { nodeId, takeId } = finalVisual
    const seq = ++resolvedFvSeqRef.current

    // If FV is in current take, resolve from local payload
    if (takeId === readyTakeId && readyPayload?.nodes) {
      const node = readyPayload.nodes.find((n: any) => n.id === nodeId)
      if (node) {
        setResolvedFv({ src: node.data?.src ?? '', storagePath: node.data?.storage_path ?? '' })
        return
      }
    }

    // Otherwise fetch snapshot from the FV's take
    loadLatestTakeSnapshotAction(takeId).then(snapshot => {
      if (seq !== resolvedFvSeqRef.current) return
      const nodes = (snapshot?.payload as any)?.nodes as any[] | undefined
      const node = nodes?.find((n: any) => n.id === nodeId)
      if (node) {
        setResolvedFv({ src: node.data?.src ?? '', storagePath: node.data?.storage_path ?? '' })
      } else {
        setResolvedFv(null)
      }
    }).catch(() => { if (seq === resolvedFvSeqRef.current) setResolvedFv(null) })
  }, [finalVisual, readyTakeId, readyPayload])



  // Download helper (fetch→blob, cross-origin safe)
  const triggerDownload = useCallback(async (url: string, filename: string) => {
    try {
      const res = await fetch(url); const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = blobUrl; a.download = filename
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    } catch { window.open(url, '_blank') }
  }, [])
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const extFromUrl = (url: string, fb: string) => { try { const e = new URL(url).pathname.split('.').pop(); return e && e.length <= 5 ? e : fb } catch { return fb } }
  const sceneIdx = stripData?.scenes?.findIndex(s => s.shots?.some(sh => sh.id === shot.id)) ?? 0
  const shotPrefix = `S${pad2(sceneIdx + 1)}_SH${pad2(shot.order_index + 1)}`
  const fvTakeLabel = shot.final_visual_take_id ? (takes.find(t => t.id === shot.final_visual_take_id)?.name ?? null) : null
  const outputTakeLabel = shot.output_take_id ? (takes.find(t => t.id === shot.output_take_id)?.name ?? null) : null
  // Auto-dismiss upload error toast after 6s
  useEffect(() => {
    if (!uploadError) return
    const t = setTimeout(() => setUploadError(null), 6000)
    return () => clearTimeout(t)
  }, [uploadError])
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const undoHistoryByTakeRef = useRef<Map<string, UndoHistory>>(new Map())
  const pendingUploadsRef = useRef(0)
  const [uploadsInProgress, setUploadsInProgress] = useState(false)

  // Prevent navigation (shot change via strip, browser back/close) during uploads
  useEffect(() => {
    if (!uploadsInProgress) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [uploadsInProgress])
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const pendingDropRef = useRef<{ type: 'image' | 'video'; screenX: number; screenY: number } | null>(null)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const dragCounterRef = useRef(0)

  const persistSnapshot = useCallback(async (nodes: CanvasNode[], edges: CanvasEdge[]) => {
    if (!currentTakeId) return
    try {
      // Sanitize: never persist blob: URLs in src.
      // storage_path is pre-generated and always valid → derive publicUrl from it.
      const sanitizedNodes = nodes.map(n => {
        if (n.type === 'image' || n.type === 'video') {
          const src = (n.data as any)?.src
          if (typeof src === 'string' && src.startsWith('blob:')) {
            const sp = (n.data as any)?.storage_path
            if (sp) {
              // Derive public URL from storage_path (deterministic, no network call)
              const bucket = n.type === 'image' ? 'take-images' : 'take-videos'
              const supabase = createClient()
              const { data } = supabase.storage.from(bucket).getPublicUrl(sp)
              return { ...n, data: { ...n.data, src: data?.publicUrl ?? '' } }
            }
            // Fallback: no storage_path (should not happen with precompute pattern)
            return { ...n, data: { ...n.data, src: '' } }
          }
        }
        return n
      })
      await saveTakeSnapshotAction({
        project_id: projectId,
        scene_id: shot.scene_id,
        shot_id: shot.id,
        take_id: currentTakeId,
        payload: { nodes: sanitizedNodes, edges },
        reason: 'manual_save',
      })
    } catch (err) {
      console.error('Auto-persist failed:', err)
    }
  }, [projectId, shot.scene_id, shot.id, currentTakeId])

  const handleNodesChange = useCallback((nodes: CanvasNode[], edges: CanvasEdge[]) => {
    liveNodesRef.current = nodes
    // Bump tick so inspector re-derives its node after data edits
    if (inspectorOpenRef.current) setInspectorTick(t => t + 1)
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current)
    }
    persistTimerRef.current = setTimeout(() => {
      persistSnapshot(nodes, edges)
    }, 800)
  }, [persistSnapshot])

  const handleUndoHistoryChange = useCallback((history: UndoHistory) => {
    if (currentTakeId) {
      undoHistoryByTakeRef.current.set(currentTakeId, history)
    }
  }, [currentTakeId])

  // ── Request sequencing guard ──
  const takeLoadSeqRef = useRef(0)
  const shotDerivedSeqRef = useRef(0)

  // Load shot-level derived state (FV + ratings) — shot-scoped, not take-scoped
  const loadShotDerivedState = useCallback(async () => {
    const seq = ++shotDerivedSeqRef.current
    const [fv, ratings] = await Promise.all([
      getShotFinalVisualAction({ shotId: shot.id }),
      getShotMediaRatings({ shotId: shot.id }),
    ])
    if (seq !== shotDerivedSeqRef.current) return // stale response, discard
    setFinalVisual(fv)
    setRatingMap(ratings)
  }, [shot.id])

  // Load take snapshot (take-scoped)
  useEffect(() => {
    if (!currentTakeId) return

    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current)
      persistTimerRef.current = null
    }

    setIsLoading(true)
    const seq = ++takeLoadSeqRef.current

    Promise.all([
      loadLatestTakeSnapshotAction(currentTakeId),
      // Only load shot-derived state on first take load (not on every take switch)
      !finalVisual
        ? loadShotDerivedState()
        : Promise.resolve(),
    ])
      .then(([snapshot]) => {
        if (seq !== takeLoadSeqRef.current) return // stale response
        let payload: SnapshotPayload | undefined

        if (snapshot?.payload) {
          const raw = snapshot.payload as any
          if (Array.isArray(raw)) {
            payload = { nodes: raw as CanvasNode[], edges: [] }
          } else if (raw.nodes) {
            payload = { nodes: raw.nodes as CanvasNode[], edges: (raw.edges ?? []) as CanvasEdge[] }
          }
        }

        setReadyTakeId(currentTakeId)
        console.log('[LOAD] payload defined?', !!payload, 'nodes?', payload?.nodes?.length ?? 0, 'edges?', payload?.edges?.length ?? 0)
        if (payload?.nodes) {
          try {
            const normalized = normalizeColumnContainment(payload.nodes)
            console.log('[NORM] input:', payload.nodes.length, 'output:', normalized.length)
            payload = { nodes: normalized, edges: payload.edges ?? [] }
          } catch (err) {
            console.error('[normalizeColumnContainment] failed, using raw payload:', err)
          }
        }
        setReadyPayload(payload)
        liveNodesRef.current = payload?.nodes ?? []

        setIsLoading(false)
      })
  }, [currentTakeId, shot.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current)
      }
    }
  }, [])

  const handleSidebarNoteMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setGhostPos({ x: e.clientX, y: e.clientY })

    const handleMouseMove = (moveEvent: MouseEvent) => {
      setGhostPos({ x: moveEvent.clientX, y: moveEvent.clientY })
    }

    const handleMouseUp = (upEvent: MouseEvent) => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      setGhostPos(null)

      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getCanvasRect()
      if (!rect) return

      const x = upEvent.clientX - rect.left
      const y = upEvent.clientY - rect.top

      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return

      canvas.createNodeAtScreen(x, y)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [])

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const drop = pendingDropRef.current
    pendingDropRef.current = null
    e.target.value = ''

    if (!file || !canvasRef.current || !drop) return

    const sizeErr = checkFileSize(file)
    if (sizeErr) { setUploadError(sizeErr); return }

    try {
      const supabase = createClient()
      const { storagePath, bucket, publicUrl } = precomputeMediaPath(supabase, projectId, shot.id, file, 'image')

      // 1. Measure dimensions + blob preview
      const previewUrl = URL.createObjectURL(file)
      const dimensions = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        const img = new window.Image()
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
        img.onerror = reject
        img.src = previewUrl
      })

      // 2. Create node with real storage_path + blob src (persist-safe)
      const nodeId = canvasRef.current.createImageNodeAtScreen(drop.screenX, drop.screenY, {
        src: previewUrl,
        storage_path: storagePath,
        naturalWidth: dimensions.w,
        naturalHeight: dimensions.h,
      })

      // 3. Upload async to pre-determined path
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(storagePath, file, { cacheControl: '3600', upsert: false })

      if (uploadError) {
        setUploadError('Image upload failed: ' + uploadError.message)
        return
      }

      // 4. Swap blob → public URL (storage_path already correct)
      if (canvasRef.current) {
        canvasRef.current.updateNodeData(nodeId, { src: publicUrl })
      }

      // 5. Revoke blob
      setTimeout(() => URL.revokeObjectURL(previewUrl), 2000)
    } catch (err) {
      setUploadError('Image upload failed: ' + (err instanceof Error ? err.message : 'unknown error'))
    }
  }, [projectId, shot.id])

  // Step 1A — Video Upload
  const handleVideoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const drop = pendingDropRef.current
    pendingDropRef.current = null
    e.target.value = ''

    if (!file || !canvasRef.current || !drop) return

    const sizeErr = checkFileSize(file)
    if (sizeErr) { setUploadError(sizeErr); return }

    try {
      const supabase = createClient()
      const { storagePath, bucket, publicUrl } = precomputeMediaPath(supabase, projectId, shot.id, file, 'video')

      // 1. Create node with real storage_path + blob src
      const previewUrl = URL.createObjectURL(file)
      const nodeId = canvasRef.current.createVideoNodeAtScreen(drop.screenX, drop.screenY, {
        src: previewUrl,
        storage_path: storagePath,
        filename: file.name,
        mime_type: file.type || 'video/mp4',
        size: file.size,
      })

      // 2. Upload async
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(storagePath, file, { cacheControl: '3600', upsert: false })

      if (uploadError) {
        setUploadError('Video upload failed: ' + uploadError.message)
        return
      }

      // 3. Swap blob → public URL
      if (canvasRef.current) {
        canvasRef.current.updateNodeData(nodeId, { src: publicUrl })
      }

      // 4. Revoke blob
      setTimeout(() => URL.revokeObjectURL(previewUrl), 2000)
    } catch (err) {
      setUploadError('Video upload failed: ' + (err instanceof Error ? err.message : 'unknown error'))
    }
  }, [projectId, shot.id])

  const handleNewTake = async () => {
    try {
      const newTake = await createTakeAction({ projectId, shotId: shot.id })
      if (!newTake.take_number) throw new Error('Server did not return take_number')

      setTakes(prev => {
        const localTake: Take = {
          id: newTake.id,
          shot_id: newTake.shot_id ?? shot.id,
          name: `Take ${newTake.take_number}`,
          description: null,
          status: newTake.status,
          order_index: prev.length,
          take_number: newTake.take_number,
          created_at: newTake.created_at,
          updated_at: newTake.created_at,
          output_video_node_id: null,
        }
        return [...prev, localTake]
      })
      setCurrentTakeId(newTake.id)
    } catch (error) {
      console.error('Failed to create take:', error)
    }
  }

  const handleDuplicateTake = async () => {
    if (!currentTakeId || !canvasRef.current) return

    const snapshot = canvasRef.current.getSnapshot()
    const clonedPayload = structuredClone(snapshot)

    // Duplicate Take Canon: new take is born neutral.
    // 1. Regenerate all node IDs (prevents shot-level FV/Output matching by stale id)
    const idMap = new Map<string, string>()
    if (clonedPayload.nodes) {
      // Pass 1: generate new IDs
      for (const node of clonedPayload.nodes) {
        idMap.set(node.id, crypto.randomUUID())
        node.id = idMap.get(node.id)!
      }
      // Pass 2: remap parentId, childOrder, strip editorial markers
      for (const node of clonedPayload.nodes) {
        if (node.data) {
          // Remap column containment
          const pid = (node.data as any).parentId
          if (pid) (node.data as any).parentId = idMap.get(pid) ?? null
          // Remap childOrder for columns
          if (node.type === 'column' && (node.data as any).childOrder) {
            (node.data as any).childOrder = ((node.data as any).childOrder as string[])
              .map((cid: string) => idMap.get(cid))
              .filter(Boolean)
          }
          // Strip editorial markers only
          delete (node.data as any).promotedSelectionId
          delete (node.data as any).selectionNumber
          delete (node.data as any).isFinalVisual
        }
      }
    }

    // 3. Remap edge references to new node IDs
    if (clonedPayload.edges) {
      for (const edge of clonedPayload.edges) {
        edge.from = idMap.get(edge.from) ?? edge.from
        edge.to = idMap.get(edge.to) ?? edge.to
      }
    }

    try {
      const newTake = await createTakeAction({ projectId, shotId: shot.id })
      if (!newTake.take_number) throw new Error('Server did not return take_number')

      await saveTakeSnapshotAction({
        project_id: projectId,
        scene_id: shot.scene_id,
        shot_id: shot.id,
        take_id: newTake.id,
        payload: clonedPayload,
        reason: 'duplicate_take_seed',
      })

      setTakes(prev => {
        const localTake: Take = {
          id: newTake.id,
          shot_id: newTake.shot_id ?? shot.id,
          name: `Take ${newTake.take_number}`,
          description: null,
          status: newTake.status,
          order_index: prev.length,
          take_number: newTake.take_number,
          created_at: newTake.created_at,
          updated_at: newTake.created_at,
          output_video_node_id: null,
        }
        return [...prev, localTake]
      })
      setCurrentTakeId(newTake.id)
    } catch (error) {
      console.error('Failed to duplicate take:', error)
    }
  }

  const handleDeleteTake = (takeId: string) => {
    const targetTake = takes.find(t => t.id === takeId)
    const isFVTake = finalVisual?.takeId === takeId

    const title = isFVTake ? 'Delete Take + Clear Final Visual' : 'Delete Take'
    const body = isFVTake
      ? `You're deleting "${targetTake?.name ?? 'this Take'}" which contains the Final Visual.\n\nThis will also clear the Shot Final Visual (header + strip + take indicators).\n\nThis action is irreversible.`
      : `Delete "${targetTake?.name ?? 'this Take'}"?\n\nThis action is irreversible.`

    setConfirmState({
      title,
      body,
      confirmLabel: isFVTake ? 'Delete + Clear FV' : 'Delete',
      danger: true,
      onConfirm: () => {
        setConfirmState(null)
        void executeDeleteTake(takeId, isFVTake)
      },
    })
  }

  const executeDeleteTake = async (takeId: string, isFVTake: boolean) => {
    // FV guard: clear FV client-side first (FREEZED — do not modify)
    if (isFVTake) {
      await clearShotFinalVisualAction({ shotId: shot.id })
      setFinalVisual(null)
      fvUndoStackRef.current = []
      setFvUndoCount(0)
      router.refresh()
    }

    const deletedId = takeId
    const remainingTakes = takes.filter(t => t.id !== deletedId)

    setTakes(remainingTakes)

    if (remainingTakes.length > 0) {
      const deletedIndex = takes.findIndex(t => t.id === deletedId)
      const nextTake = remainingTakes[Math.min(deletedIndex, remainingTakes.length - 1)]
      setCurrentTakeId(nextTake.id)
    } else {
      setCurrentTakeId(null as any)
      setReadyTakeId(null)
      setReadyPayload(undefined)
    }

    undoHistoryByTakeRef.current.delete(deletedId)

    try {
      await deleteTakeWithGuardAction(deletedId)
      router.refresh()
    } catch (error) {
      console.error('Failed to delete take:', error)
      setTakes(takes)
      setCurrentTakeId(deletedId)
    }
  }

  // ── Approved Take handlers ──
  const handleApproveTake = async (takeId: string) => {
    await approveTakeAction(shot.id, takeId)
    router.refresh()
  }

  const handleRevokeTake = async () => {
    await revokeTakeAction(shot.id)
    router.refresh()
  }

  // ── Take Export ──
  const [exportNodes, setExportNodes] = useState<CanvasNode[] | null>(null)

  const handleExportOpen = () => {
    if (!canvasRef.current) return
    setExportNodes(canvasRef.current.getSnapshot().nodes)
  }

  const handleExportClose = () => {
    setExportNodes(null)
  }

  // ── Production Launch Panel ──
  const [showPLP, setShowPLP] = useState(false)
  const [plpNodes, setPlpNodes] = useState<CanvasNode[]>([])
  const [plpEdges, setPlpEdges] = useState<CanvasEdge[]>([])
  const [showEntityLibrary, setShowEntityLibrary] = useState(false)
  const [crystallizeState, setCrystallizeState] = useState<{
    selectedIds: string[]
    entityContent: any
    nodeCount: number
  } | null>(null)
  const [editEntityId, setEditEntityId] = useState<string | null>(null)
  // ── Inspector Overlay (read-only, no persistence) ──
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const inspectorOpenRef = useRef(false)
  useEffect(() => { inspectorOpenRef.current = inspectorOpen }, [inspectorOpen])
  const inspectorSelectionRef = useRef<{ ids: Set<string>; primaryId: string | null }>({ ids: new Set(), primaryId: null })
  const [inspectorPrimaryId, setInspectorPrimaryId] = useState<string | null>(null)
  const [inspectorTick, setInspectorTick] = useState(0) // increments to re-derive node after data change

  const handleSelectionChange = useCallback((ids: Set<string>, primaryId: string | null) => {
    inspectorSelectionRef.current = { ids, primaryId }
    // Only trigger re-render if inspector is open — avoids render storms when closed
    if (inspectorOpen) setInspectorPrimaryId(primaryId)
  }, [inspectorOpen])

  const handleToggleInspector = useCallback(() => {
    setInspectorOpen(prev => {
      if (!prev) {
        // Opening: sync current selection from ref
        setInspectorPrimaryId(inspectorSelectionRef.current.primaryId)
      }
      return !prev
    })
  }, [])

  // When inspector is open and selection changes, keep it synced
  useEffect(() => {
    if (inspectorOpen) setInspectorPrimaryId(inspectorSelectionRef.current.primaryId)
  }, [inspectorOpen])

  // Auto-close inspector when PLP or Export opens (safe UX)
  useEffect(() => { if (showPLP || exportNodes) setInspectorOpen(false) }, [showPLP, exportNodes])

  // Derive inspected node from live nodes
  const inspectorNode = useMemo(() => {
    if (!inspectorOpen || !inspectorPrimaryId) return null
    return liveNodesRef.current.find(n => n.id === inspectorPrimaryId) ?? null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectorOpen, inspectorPrimaryId, inspectorTick])

  // Inspector write callback: update node.data via canvas imperative handle
  // Uses updateNodeDataWithHistory which does setNodes + pushHistory + emitNodesChange
  const handleUpdateNodeData = useCallback((nodeId: string, patch: Record<string, any>) => {
    canvasRef.current?.updateNodeDataWithHistory(nodeId, patch)
  }, [])

  const handleOpenPLP = () => {
    if (!canvasRef.current) return
    const snap = canvasRef.current.getSnapshot()
    setPlpNodes(snap.nodes)
    setPlpEdges(snap.edges)
    // DEBUG — remove after testing
    console.log('[PLP debug] edges count:', snap.edges.length)
    const promptIds = new Set(snap.nodes.filter((n: any) => n.type === 'prompt').map((n: any) => n.id))
    for (const e of snap.edges) {
      const dir = promptIds.has(e.to) ? 'incoming' : promptIds.has(e.from) ? 'outgoing' : 'unrelated'
      console.log(`[PLP edge] ${e.from.slice(0, 8)}→${e.to.slice(0, 8)} dir=${dir}`)
    }
    setShowPLP(true)
  }
  const handleInsertEntityRef = useCallback((entity: Entity) => {
    if (!canvasRef.current) return
    // Insert at canvas center
    canvasRef.current.createEntityRefNodeAtScreen(
      window.innerWidth / 2,
      window.innerHeight / 2,
      {
        entity_id: entity.id,
        entity_name: entity.name,
        entity_type: entity.entity_type,
        thumbnail_path: (entity.content as any)?.thumbnail_path,
      }
    )
    setShowEntityLibrary(false)
  }, [])

  const handleCrystallize = useCallback(() => {
    if (!canvasRef.current) return
    const snap = canvasRef.current.getSnapshot()
    const selectedIds = canvasRef.current.getSelectedNodeIds()
    if (!selectedIds || selectedIds.length === 0) return

    const selectedNodes = snap.nodes.filter(n => selectedIds.includes(n.id))
    const entityContent = {
      media: selectedNodes.filter(n => n.type === 'image' || n.type === 'video').map(n => ({
        storage_path: (n.data as any).storage_path ?? '',
        bucket: n.type === 'video' ? 'take-videos' : 'take-images',
        display_name: (n.data as any).display_name ?? (n.data as any).filename ?? '',
        asset_type: (n.type === 'video' ? 'video' : 'image') as 'image' | 'video',
      })).filter(m => m.storage_path),
      prompts: selectedNodes.filter(n => n.type === 'prompt').map(n => ({
        body: (n.data as any).body ?? (n.data as any).text ?? '',
        promptType: (n.data as any).promptType ?? (n.data as any).prompt_type ?? 'prompt',
        origin: (n.data as any).origin ?? 'Manual',
        title: (n.data as any).title ?? '',
      })).filter(p => p.body),
      notes: selectedNodes.filter(n => n.type === 'note').map(n => ({
        body: (n.data as any).body ?? (n.data as any).text ?? '',
      })).filter(n => n.body),
    }

    setCrystallizeState({ selectedIds, entityContent, nodeCount: selectedIds.length })
  }, [])

  const handleCrystallizeConfirm = useCallback(async (name: string, entityType: import('@/app/actions/entities').EntityType) => {
    if (!canvasRef.current || !crystallizeState) return

    const entity = await crystallizeEntityAction({
      projectId,
      name,
      entityType,
      content: crystallizeState.entityContent,
    })

    if (!entity) {
      console.error('[crystallize] entity creation failed')
      setCrystallizeState(null)
      return
    }

    canvasRef.current.crystallize({
      entity_id: entity.id,
      entity_name: entity.name,
      entity_type: entity.entity_type,
    })

    setCrystallizeState(null)
  }, [projectId, crystallizeState])


  // ── Shot Final Visual ──
  const fvUndoStackRef = useRef<{ nodeId: string | null; takeId: string | null }[]>([])
  const [fvUndoCount, setFvUndoCount] = useState(0)

  const handleSetFinalVisual = useCallback(async (nodeId: string) => {
    if (!readyTakeId) return
    fvUndoStackRef.current.push({
      nodeId: finalVisual?.nodeId ?? null,
      takeId: finalVisual?.takeId ?? null,
    })
    setFvUndoCount(fvUndoStackRef.current.length)
    const result = await setShotFinalVisualAction({ shotId: shot.id, nodeId, takeId: readyTakeId })
    if (result.success) {
      await loadShotDerivedState()
      router.refresh()
    } else {
      fvUndoStackRef.current.pop()
      setFvUndoCount(fvUndoStackRef.current.length)
    }
  }, [shot.id, readyTakeId, finalVisual, loadShotDerivedState, router])

  const handleUndoFinalVisual = useCallback(async () => {
    const prev = fvUndoStackRef.current.pop()
    setFvUndoCount(fvUndoStackRef.current.length)
    if (prev === undefined) return
    if (prev.nodeId === null) {
      const result = await clearShotFinalVisualAction({ shotId: shot.id })
      if (result.success) {
        setFinalVisual(null)
        router.refresh()
      }
    } else {
      const result = await setShotFinalVisualAction({ shotId: shot.id, nodeId: prev.nodeId, takeId: prev.takeId! })
      if (result.success) {
        await loadShotDerivedState()
        router.refresh()
      }
    }
  }, [shot.id, loadShotDerivedState, router])

  // Strip rendering helper
  const renderStrip = () => {
    if (!stripData || stripData.scenes.length === 0) return null
    return (
      <div className="relative">
        <SceneShotStrip
          key={shot.id}
          projectId={projectId}
          scenes={stripData.scenes}
          currentSceneId={stripData.currentSceneId}
          currentShotId={shot.id}
          sceneShots={stripData.sceneShots}
        />
        {uploadsInProgress && (
          <div
            className="absolute inset-0 z-50 cursor-not-allowed"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setUploadError('Wait for uploads to finish before switching shot') }}
          />
        )}
      </div>
    )
  }

  if (takes.length === 0) {
    return (
      <div className="flex-1 flex flex-col">
        {uploadError && (
          <div className="fixed top-4 right-4 z-[9999] max-w-sm">
            <div className="bg-red-900/95 border border-red-700 text-red-100 px-4 py-3 rounded-lg shadow-lg flex items-start gap-3">
              <span className="text-sm flex-1">{uploadError}</span>
              <button onClick={() => setUploadError(null)} className="text-red-300 hover:text-red-100 text-lg leading-none shrink-0">×</button>
            </div>
          </div>
        )}
        {renderStrip()}
        <ShotHeader shot={shot} projectId={projectId} finalVisual={resolvedFv}
          onUndoFinalVisual={fvUndoCount > 0 ? handleUndoFinalVisual : undefined}
          outputVideoSrc={shot.output_video_src ?? null}
          onPreviewFV={resolvedFv?.src ? () => setInspectMedia({ type: 'image', src: resolvedFv.src }) : undefined}
          onPreviewOutput={shot.output_video_src ? () => setInspectMedia({ type: 'video', src: shot.output_video_src! }) : undefined}
          onDownloadFV={resolvedFv?.src ? () => triggerDownload(resolvedFv.src, `${shotPrefix}_FV.${extFromUrl(resolvedFv.src, 'png')}`) : undefined}
          onDownloadOutput={shot.output_video_src ? () => triggerDownload(shot.output_video_src!, `${shotPrefix}_OUTPUT.${extFromUrl(shot.output_video_src!, 'mp4')}`) : undefined}
          fvTakeLabel={fvTakeLabel}
          outputTakeLabel={outputTakeLabel}
        />
        <div className="flex-1 flex items-center justify-center bg-zinc-950">
          <div className="text-center">
            <p className="text-zinc-500 text-sm mb-4">Nessun Take presente per questo Shot</p>
            <button
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded text-sm transition-colors"
              onClick={handleNewTake}
            >
              Crea il primo Take
            </button>
          </div>
        </div>
      </div>
    )
  }

  const currentTake = readyTakeId ? takes.find(t => t.id === readyTakeId) : null

  const shotOutputNodeId = shot.output_take_id === readyTakeId ? (shot.output_video_node_id ?? null) : null
  const currentUndoHistory = readyTakeId
    ? undoHistoryByTakeRef.current.get(readyTakeId)
    : undefined

  return (
    <div className="flex-1 flex flex-col">
      {/* Upload error toast */}
      {uploadError && (
        <div className="fixed top-4 right-4 z-[9999] max-w-sm animate-in fade-in slide-in-from-top-2">
          <div className="bg-red-900/95 border border-red-700 text-red-100 px-4 py-3 rounded-lg shadow-lg flex items-start gap-3">
            <span className="text-sm flex-1">{uploadError}</span>
            <button
              onClick={() => setUploadError(null)}
              className="text-red-300 hover:text-red-100 text-lg leading-none shrink-0"
            >×</button>
          </div>
        </div>
      )}
      {renderStrip()}
      <ShotHeader shot={shot} projectId={projectId} finalVisual={resolvedFv}
        onUndoFinalVisual={fvUndoCount > 0 ? handleUndoFinalVisual : undefined}
        outputVideoSrc={shot.output_video_src ?? null}
        onPreviewFV={resolvedFv?.src ? () => setInspectMedia({ type: 'image', src: resolvedFv.src }) : undefined}
        onPreviewOutput={shot.output_video_src ? () => setInspectMedia({ type: 'video', src: shot.output_video_src! }) : undefined}
        onDownloadFV={resolvedFv?.src ? () => triggerDownload(resolvedFv.src, `${shotPrefix}_FV.${extFromUrl(resolvedFv.src, 'png')}`) : undefined}
        onDownloadOutput={shot.output_video_src ? () => triggerDownload(shot.output_video_src!, `${shotPrefix}_OUTPUT.${extFromUrl(shot.output_video_src!, 'mp4')}`) : undefined}
        fvTakeLabel={fvTakeLabel}
        outputTakeLabel={outputTakeLabel}
      />

      <TakeTabs
        takes={takes}
        currentTakeId={currentTakeId}
        onTakeChange={(id) => {
          if (uploadsInProgress) {
            setConfirmState({
              title: 'Uploads in Progress',
              body: 'Switching take while uploads are in progress. Unfinished uploads may appear empty.',
              confirmLabel: 'Switch Anyway',
              danger: true,
              onConfirm: () => { setConfirmState(null); setCurrentTakeId(id) },
            })
            return
          }
          setCurrentTakeId(id)
        }}
        onNewTake={handleNewTake}
        onDuplicate={handleDuplicateTake}
        onDelete={handleDeleteTake}

        approvedTakeId={shot.approved_take_id}
        fvTakeId={shot.final_visual_take_id ?? null}
        outputTakeId={shot.output_take_id ?? null}
        onApproveTake={handleApproveTake}
        onRevokeTake={handleRevokeTake}
        onOpenProduction={handleOpenPLP}
        isProductionReady={shot.approved_take_id === readyTakeId}
      />

      <div className="flex-1 flex">
        <aside className="w-12 bg-zinc-800 flex flex-col items-center py-2 gap-1 shrink-0">
          {/* Tool rail ALTO: azioni */}
          <button onClick={() => setShowEntityLibrary(true)} title="Entity Library">
            👤
          </button>
          {/* More menu (⋯) — secondary actions */}
          <div className="relative group">
            <button
              className="w-9 h-9 bg-zinc-700 hover:bg-zinc-500 hover:scale-105 rounded flex items-center justify-center transition-all select-none"
              title="More actions"
            >
              <span className="text-xs text-zinc-400 pointer-events-none">⋯</span>
            </button>
            <div className="absolute left-full top-0 ml-1 hidden group-hover:flex flex-col bg-zinc-800 border border-zinc-600 rounded shadow-lg z-20 min-w-[140px]">
              <button
                onClick={handleExportOpen}
                className="px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700 text-left transition-colors rounded-t"
              >
                Export .md
              </button>
            </div>
          </div>

          <div className="w-6 border-t border-zinc-600 my-1" />

          {/* Tool rail BASSO: drag nodes */}
          <button
            onMouseDown={handleSidebarNoteMouseDown}
            className="w-9 h-9 bg-zinc-700 hover:bg-zinc-500 hover:scale-105 rounded flex items-center justify-center transition-all select-none"
            title="Drag to canvas to create Note"
          >
            <span className="text-xs text-zinc-400 pointer-events-none">Note</span>
          </button>

          <button
            draggable
            onDragStart={(e) => { e.dataTransfer.setData('application/cineboard-type', 'image'); e.dataTransfer.effectAllowed = 'copy' }}
            className="w-9 h-9 bg-zinc-700 hover:bg-zinc-500 hover:scale-105 rounded flex items-center justify-center transition-all select-none cursor-grab active:cursor-grabbing"
            title="Drag to canvas to add Image"
          >
            <span className="text-xs text-zinc-400 pointer-events-none">Img</span>
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />

          <button
            draggable
            onDragStart={(e) => { e.dataTransfer.setData('application/cineboard-type', 'video'); e.dataTransfer.effectAllowed = 'copy' }}
            className="w-9 h-9 bg-zinc-700 hover:bg-zinc-500 hover:scale-105 rounded flex items-center justify-center transition-all select-none cursor-grab active:cursor-grabbing"
            title="Drag to canvas to add Video"
          >
            <span className="text-xs text-zinc-400 pointer-events-none">Vid</span>
          </button>
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            onChange={handleVideoUpload}
            className="hidden"
          />
          {/* R4-004a: Column */}
          <button
            onMouseDown={(e) => {
              e.preventDefault()
              setGhostPos({ x: e.clientX, y: e.clientY })

              const handleMouseMove = (moveEvent: MouseEvent) => {
                setGhostPos({ x: moveEvent.clientX, y: moveEvent.clientY })
              }

              const handleMouseUp = (upEvent: MouseEvent) => {
                window.removeEventListener('mousemove', handleMouseMove)
                window.removeEventListener('mouseup', handleMouseUp)
                setGhostPos(null)

                const canvas = canvasRef.current
                if (!canvas) return
                const rect = canvas.getCanvasRect()
                if (!rect) return
                const x = upEvent.clientX - rect.left
                const y = upEvent.clientY - rect.top
                if (x < 0 || y < 0 || x > rect.width || y > rect.height) return
                canvas.createColumnNodeAtScreen(x, y)
              }

              window.addEventListener('mousemove', handleMouseMove)
              window.addEventListener('mouseup', handleMouseUp)
            }}
            className="w-9 h-9 bg-zinc-700 hover:bg-zinc-500 hover:scale-105 rounded flex items-center justify-center transition-all select-none"
            title="Drag to canvas to create Column"
          >
            <span className="text-xs text-zinc-400 pointer-events-none">Col</span>
          </button>

          {/* Blocco 4A: Prompt */}
          <button
            onMouseDown={(e) => {
              e.preventDefault()
              setGhostPos({ x: e.clientX, y: e.clientY })

              const handleMouseMove = (moveEvent: MouseEvent) => {
                setGhostPos({ x: moveEvent.clientX, y: moveEvent.clientY })
              }

              const handleMouseUp = (upEvent: MouseEvent) => {
                window.removeEventListener('mousemove', handleMouseMove)
                window.removeEventListener('mouseup', handleMouseUp)
                setGhostPos(null)

                const canvas = canvasRef.current
                if (!canvas) return
                const rect = canvas.getCanvasRect()
                if (!rect) return
                const x = upEvent.clientX - rect.left
                const y = upEvent.clientY - rect.top
                if (x < 0 || y < 0 || x > rect.width || y > rect.height) return
                canvas.createPromptNodeAtScreen(x, y)
              }

              window.addEventListener('mousemove', handleMouseMove)
              window.addEventListener('mouseup', handleMouseUp)
            }}
            className="w-9 h-9 bg-amber-900/50 hover:bg-amber-700/50 hover:scale-105 rounded flex items-center justify-center transition-all select-none"
            title="Drag to canvas to create Prompt"
          >
            <span className="text-[9px] text-amber-400 pointer-events-none">Prm</span>
          </button>
          <button onClick={handleCrystallize} title="Crystallize Selection → Entity">
            💎
          </button>
        </aside>

        <div
          className={`flex-1 flex relative${isDraggingFile ? ' ring-2 ring-inset ring-zinc-500/50' : ''}`}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
          onDragEnter={(e) => { e.preventDefault(); dragCounterRef.current++; setIsDraggingFile(true) }}
          onDragLeave={() => { dragCounterRef.current--; if (dragCounterRef.current <= 0) { setIsDraggingFile(false); dragCounterRef.current = 0 } }}
          onDrop={async (e) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDraggingFile(false)
            dragCounterRef.current = 0

            const canvas = canvasRef.current
            if (!canvas) return
            const rect = canvas.getCanvasRect()
            if (!rect) return
            const screenX = e.clientX - rect.left
            const screenY = e.clientY - rect.top

            // Case A: Sidebar drag (Img/Vid button)
            const cineboardType = e.dataTransfer.getData('application/cineboard-type')
            if (cineboardType === 'image' || cineboardType === 'video') {
              pendingDropRef.current = { type: cineboardType, screenX, screenY }
              // Sync click — no async before this
              if (cineboardType === 'image') imageInputRef.current?.click()
              else videoInputRef.current?.click()
              return
            }

            // Case B: External file drop (from OS)
            const files = Array.from(e.dataTransfer.files)
            if (files.length === 0) return

            // Filter supported + size check
            const supported: { file: File; type: 'image' | 'video' }[] = []
            let skippedCount = 0
            const sizeErrors: string[] = []

            for (const file of files) {
              const isImage = file.type.startsWith('image/')
              const isVideo = file.type.startsWith('video/')
              if (!isImage && !isVideo) { skippedCount++; continue }
              const sizeErr = checkFileSize(file)
              if (sizeErr) { sizeErrors.push(sizeErr); continue }
              supported.push({ file, type: isImage ? 'image' : 'video' })
            }

            if (sizeErrors.length > 0) setUploadError(sizeErrors[0] + (sizeErrors.length > 1 ? ` (+${sizeErrors.length - 1} more)` : ''))
            if (skippedCount > 0 && sizeErrors.length === 0) setUploadError(`${skippedCount} unsupported file(s) skipped`)
            if (supported.length === 0) return

            // ── Single file: blob preview + exact drop position ──
            if (supported.length === 1) {
              const { file, type } = supported[0]
              try {
                const previewUrl = URL.createObjectURL(file)
                const supabase = createClient()
                const { storagePath, bucket, publicUrl } = precomputeMediaPath(supabase, projectId, shot.id, file, type)

                if (type === 'image') {
                  const dimensions = await new Promise<{ w: number; h: number }>((resolve, reject) => {
                    const img = new window.Image()
                    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
                    img.onerror = reject
                    img.src = previewUrl
                  })
                  const nodeId = canvasRef.current?.createImageNodeAtScreen(screenX, screenY, {
                    src: previewUrl, storage_path: storagePath,
                    naturalWidth: dimensions.w, naturalHeight: dimensions.h,
                  })
                  const { error: uploadError } = await supabase.storage
                    .from(bucket)
                    .upload(storagePath, file, { cacheControl: '3600', upsert: false })
                  if (uploadError) { setUploadError('Image upload failed: ' + uploadError.message); return }
                  if (nodeId && canvasRef.current) {
                    canvasRef.current.updateNodeData(nodeId, { src: publicUrl })
                  }
                  setTimeout(() => URL.revokeObjectURL(previewUrl), 2000)
                } else {
                  const nodeId = canvasRef.current?.createVideoNodeAtScreen(screenX, screenY, {
                    src: previewUrl, storage_path: storagePath,
                    filename: file.name, mime_type: file.type || 'video/mp4', size: file.size,
                  })
                  const { error: uploadError } = await supabase.storage
                    .from(bucket)
                    .upload(storagePath, file, { cacheControl: '3600', upsert: false })
                  if (uploadError) { setUploadError('Video upload failed: ' + uploadError.message); return }
                  if (nodeId && canvasRef.current) {
                    canvasRef.current.updateNodeData(nodeId, { src: publicUrl })
                  }
                  setTimeout(() => URL.revokeObjectURL(previewUrl), 2000)
                }
              } catch (err) {
                setUploadError('Upload failed: ' + (err instanceof Error ? err.message : 'unknown error'))
              }
              return
            }

            // ── Multi-file: all nodes created immediately, uploads in background ──
            const rawScale = canvasRef.current?.getViewportScale?.() ?? 1
            const scale = Math.max(0.2, rawScale)
            const GRID_COLS = 4
            const GRID_GAP = Math.round(32 * scale)
            const CELL_W = Math.round(440 * scale)
            const CELL_H = Math.round(248 * scale)

            // Phase 1a: Precompute paths + blob URLs + measure dimensions in parallel
            const supabase = createClient()
            const prepared = supported.map(({ file, type }) => {
              const previewUrl = URL.createObjectURL(file)
              const { storagePath, bucket, publicUrl } = precomputeMediaPath(supabase, projectId, shot.id, file, type)
              const dimPromise: Promise<{ w: number; h: number }> = type === 'image'
                ? new Promise(resolve => {
                  const img = new window.Image()
                  img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
                  img.onerror = () => resolve({ w: 400, h: 225 })
                  img.src = previewUrl
                })
                : Promise.resolve({ w: 400, h: 225 })
              return { file, type, previewUrl, storagePath, bucket, publicUrl, dimPromise }
            })

            const dimensions = await Promise.all(prepared.map(p => p.dimPromise))

            // Phase 1b: Create ALL nodes in batch with real storage_path + blob src
            const items: typeof prepared = []

            canvas.beginBatch()
            for (let i = 0; i < prepared.length; i++) {
              const p = prepared[i]
              const dim = dimensions[i]
              const col = i % GRID_COLS
              const row = Math.floor(i / GRID_COLS)
              const sx = screenX + col * (CELL_W + GRID_GAP)
              const sy = screenY + row * (CELL_H + GRID_GAP)

              const nodeId = p.type === 'image'
                ? canvasRef.current?.createImageNodeAtScreen(sx, sy, {
                  src: p.previewUrl, storage_path: p.storagePath,
                  naturalWidth: dim.w, naturalHeight: dim.h,
                })
                : canvasRef.current?.createVideoNodeAtScreen(sx, sy, {
                  src: p.previewUrl, storage_path: p.storagePath,
                  filename: p.file.name, mime_type: p.file.type || 'video/mp4', size: p.file.size,
                })

              if (nodeId) items.push({ ...p, nodeId } as any)
            }
            canvas.endBatch()

            // Phase 2: Upload in background, swap blob → publicUrl (storage_path already set)
            pendingUploadsRef.current = items.length
            setUploadsInProgress(true)

            let failCount = 0

            const uploadOne = async (item: typeof items[0] & { nodeId: string }) => {
              try {
                const { error: err } = await supabase.storage
                  .from(item.bucket)
                  .upload(item.storagePath, item.file, { cacheControl: '3600', upsert: false })
                if (err) throw err
                if (canvasRef.current) {
                  canvasRef.current.updateNodeData(item.nodeId, { src: item.publicUrl })
                }
                setTimeout(() => URL.revokeObjectURL(item.previewUrl), 2000)
              } catch (err) {
                failCount++
                URL.revokeObjectURL(item.previewUrl)
              } finally {
                pendingUploadsRef.current--
                if (pendingUploadsRef.current <= 0) setUploadsInProgress(false)
              }
            }

            const queue = [...items] as (typeof items[0] & { nodeId: string })[]
            const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
              while (queue.length > 0) {
                const item = queue.shift()!
                await uploadOne(item)
              }
            })
            await Promise.all(workers)

            if (failCount > 0) {
              setUploadError(`${failCount} file(s) failed to upload`)
            }
          }}
        >
          {readyTakeId && (
            <TakeCanvas
              ref={canvasRef}
              key={readyTakeId}
              takeId={readyTakeId}
              initialNodes={readyPayload?.nodes}
              initialEdges={readyPayload?.edges}
              initialViewport={readyViewport}
              onNodesChange={handleNodesChange}
              initialUndoHistory={currentUndoHistory}
              onUndoHistoryChange={handleUndoHistoryChange}
              currentFinalVisualNodeId={finalVisual?.nodeId ?? null}
              outputVideoNodeId={shotOutputNodeId}
              onSetFinalVisual={handleSetFinalVisual}
              onClearFinalVisual={async () => {
                await clearShotFinalVisualAction({ shotId: shot.id })
                setFinalVisual(null)
                fvUndoStackRef.current = []
                setFvUndoCount(0)
                router.refresh()
              }}

              onSetOutputVideo={async (nodeId: string) => {
                if (!readyTakeId) return
                await setTakeOutputVideo(readyTakeId, nodeId)
                setTakes(prev => prev.map(t => t.id === readyTakeId ? { ...t, output_video_node_id: nodeId } : t))
                await setShotOutputVideo(shot.id, nodeId, readyTakeId)
                router.refresh()
              }}
              onClearOutputVideo={async () => {
                if (!readyTakeId) return
                await clearTakeOutputVideo(readyTakeId)
                setTakes(prev => prev.map(t => t.id === readyTakeId ? { ...t, output_video_node_id: null } : t))
                await clearShotOutputVideo(shot.id)
                router.refresh()
              }}
              ratingMap={ratingMap}
              onSetRating={async (storagePath: string, rating: number) => {
                setRatingMap(prev => {
                  const next = { ...prev }
                  if (rating === 0) delete next[storagePath]; else next[storagePath] = rating
                  return next
                })
                await setShotMediaRating({ shotId: shot.id, storagePath, rating })
              }}
              onSelectionChange={handleSelectionChange}
              onToggleInspector={handleToggleInspector}
            />
          )}

          {/* Inspector handle icon — right edge, visible only when inspector is closed */}
          {!inspectorOpen && readyTakeId && (
            <button
              onClick={handleToggleInspector}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-6 h-12 bg-zinc-800/80 hover:bg-zinc-700 border border-r-0 border-zinc-600/60 rounded-l flex items-center justify-center transition-colors"
              title="Inspector (I)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </button>
          )}

          {/* Inspector overlay — absolute right, z-30 (under PLP z-50, under modals z-[99999]) */}
          {inspectorOpen && readyTakeId && (
            <InspectorPanel
              node={inspectorNode}
              onClose={() => setInspectorOpen(false)}
              onUpdateNodeData={handleUpdateNodeData}
              onOpenEntityEdit={(eid) => setEditEntityId(eid)}
            />
          )}

          {isLoading && (
            <div className="absolute inset-0 bg-zinc-950 flex items-center justify-center z-10">
              <p className="text-zinc-600 text-sm">Loading...</p>
            </div>
          )}
        </div>
      </div>

      {showPLP && (
        <ProductionLaunchPanel
          nodes={plpNodes}
          edges={plpEdges}
          isApproved={shot.approved_take_id === readyTakeId}
          currentFinalVisualId={finalVisual?.takeId === readyTakeId ? (finalVisual?.nodeId ?? null) : null}
          outputVideoNodeId={shotOutputNodeId}
          sceneIndex={sceneIdx}
          shotIndex={shot.order_index}
          takeNumber={currentTake?.take_number ?? 1}
          onClose={() => setShowPLP(false)}
        />
      )}
      {showEntityLibrary && (
        <EntityLibrary
          projectId={projectId}
          onClose={() => setShowEntityLibrary(false)}
          onInsertRef={handleInsertEntityRef}
          canvasRef={canvasRef}
        />
      )}
      {crystallizeState && (
        <CrystallizeModal
          nodeCount={crystallizeState.nodeCount}
          onConfirm={handleCrystallizeConfirm}
          onCancel={() => setCrystallizeState(null)}
        />
      )}
      {editEntityId && (
        <EditEntityLoader entityId={editEntityId} projectId={projectId} onClose={(saved) => {
          if (saved) {
            invalidateEntityCache(editEntityId)
            bumpEntityVersion()
          }
          setEditEntityId(null)
        }} />
      )}
      {exportNodes && readyTakeId && (
        <ExportTakeModal
          takeId={readyTakeId}
          nodes={exportNodes}
          onClose={handleExportClose}
        />
      )}

      {ghostPos && (
        <div
          className="fixed pointer-events-none z-[9999]"
          style={{ left: ghostPos.x - 100, top: ghostPos.y - 60, width: 200, height: 120 }}
        >
          <div className="w-full h-full bg-zinc-800 border border-zinc-600 rounded-lg opacity-60 flex flex-col p-3">
            <span className="text-xs text-zinc-400">Untitled</span>
            <span className="text-[10px] text-zinc-600 mt-1">Double-click to edit</span>
          </div>
        </div>
      )}

      {/* Media inspect overlay — FV image or Output video */}
      {inspectMedia && (
        <div
          className="fixed inset-0 z-[99999] bg-black/90 flex items-center justify-center cursor-pointer"
          onClick={() => setInspectMedia(null)}
        >
          <div
            style={{ maxWidth: 'calc(100vw - 64px)', maxHeight: 'calc(100vh - 64px)' }}
            onClick={e => e.stopPropagation()}
            className="cursor-default"
          >
            {inspectMedia.type === 'image' ? (
              <img src={inspectMedia.src} alt="" className="max-w-full max-h-[calc(100vh-64px)] object-contain rounded" />
            ) : (
              <video src={inspectMedia.src} controls muted className="max-w-full max-h-[calc(100vh-64px)] object-contain rounded" />
            )}
          </div>
        </div>
      )}

      {confirmState && (
        <ConfirmModal
          title={confirmState.title}
          body={confirmState.body}
          confirmLabel={confirmState.confirmLabel}
          cancelLabel={confirmState.cancelLabel}
          danger={confirmState.danger}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  )
}
// ── Thin loader for Edit Entity from Inspector ──
function EditEntityLoader({ entityId, projectId, onClose }: { entityId: string; projectId: string; onClose: (saved?: boolean) => void }) {
  const [entity, setEntity] = useState<Entity | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    getEntityAction(entityId).then(e => { if (!cancelled) { setEntity(e); setLoading(false) } }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [entityId])
  if (loading) return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70"><p className="text-xs text-zinc-500">Loading…</p></div>
  if (!entity) return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70" onClick={() => onClose()}><p className="text-xs text-red-400">Entity not found</p></div>
  return <EntityEditOverlay entity={entity} projectId={projectId} onSave={() => onClose(true)} onClose={() => onClose()} />
}