'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ShotHeader } from './shot-header'
import { TakeTabs } from './take-tabs'
import { TakeCanvas, type TakeCanvasHandle, type CanvasNode, type CanvasEdge, type UndoHistory } from '@/components/canvas/TakeCanvas'
import type { ImageData, VideoData } from '@/components/canvas/NodeContent'
import {
  saveTakeSnapshotAction,
  loadLatestTakeSnapshotAction,
} from '@/app/actions/take-snapshots'
import { createTakeAction } from '@/app/actions/takes'
import { promoteAssetSelectionAction, discardAssetSelectionAction, getShotSelectionsAction, type ActiveSelection } from '@/app/actions/shot-selections'
import { setShotFinalVisualAction, getShotFinalVisualAction, clearShotFinalVisualAction } from '@/app/actions/shot-final-visual'
import {
  approveTakeAction,
  revokeTakeAction,
  deleteTakeWithGuardAction,
} from '@/app/actions/shot-approved-take'
import { setShotOutputVideo, clearShotOutputVideo } from '@/app/actions/shot-output'
import { ExportTakeModal } from '@/components/export/export-take-modal'
import { ProductionLaunchPanel } from '@/components/production/production-launch-panel'
import { createClient } from '@/lib/supabase/client'
import { SceneShotStrip, setLastTakeForShot, type StripScene, type StripShot } from './scene-shot-strip'

// ===================================================
// SHOT WORKSPACE CLIENT — ORCHESTRATOR (R4-003)
// ===================================================

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
  output_video_node_id: string | null
  output_video_src: string | null
  output_take_id: string | null
}

interface Take {
  id: string
  shot_id: string
  name: string
  description: string | null
  status: string
  order_index: number
  created_at: string
  updated_at: string
  output_video_node_id: string | null
  output_video_src: string | null
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
  const [isLoading, setIsLoading] = useState(true)
  const [shotSelections, setShotSelections] = useState<ActiveSelection[]>([])
  const [finalVisual, setFinalVisual] = useState<{ selectionId: string; src: string; storagePath: string; selectionNumber: number; takeId: string | null } | null>(null)
  const [finalVisualTakeId, setFinalVisualTakeId] = useState<string | null>(null)
  const [shotOutputSrc, setShotOutputSrc] = useState<string | null>(shot.output_video_src ?? null)
  const [shotOutputNodeId, setShotOutputNodeId] = useState<string | null>(shot.output_video_node_id ?? null)
  const [shotOutputTakeId, setShotOutputTakeId] = useState<string | null>(shot.output_take_id ?? null)

  // Re-sync shot-level output state when shot prop changes (refresh / strip nav)
  useEffect(() => {
    setShotOutputSrc(shot.output_video_src ?? null)
    setShotOutputNodeId(shot.output_video_node_id ?? null)
    setShotOutputTakeId(shot.output_take_id ?? null)
  }, [shot.id, shot.output_video_src, shot.output_video_node_id, shot.output_take_id])

  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null)
  const [lightbox, setLightbox] = useState<{ type: 'image' | 'video'; src: string } | null>(null)

  // ── Film-first download naming ──
  const pad2 = (n: number) => String(n).padStart(2, '0')

  const sceneIndex = stripData
    ? (stripData.scenes.find(s => s.id === stripData.currentSceneId)?.order_index ?? 0) + 1
    : 1
  const shotIndex = shot.order_index + 1

  const extFromUrl = (url: string, fallback: string) => {
    try {
      const path = new URL(url).pathname
      const dot = path.lastIndexOf('.')
      if (dot >= 0) {
        const ext = path.slice(dot + 1).toLowerCase().split('?')[0]
        if (ext && ext.length <= 5) return ext
      }
    } catch { }
    return fallback
  }

  // Max quality download — fetch blob to force download (cross-origin safe)
  const triggerDownload = useCallback(async (url: string, filename: string) => {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    } catch (err) {
      console.error('Download failed:', err)
      window.open(url, '_blank')
    }
  }, [])
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const undoHistoryByTakeRef = useRef<Map<string, UndoHistory>>(new Map())
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  const persistSnapshot = useCallback(async (nodes: CanvasNode[], edges: CanvasEdge[]) => {
    if (!currentTakeId) return
    try {
      await saveTakeSnapshotAction({
        project_id: projectId,
        scene_id: shot.scene_id,
        shot_id: shot.id,
        take_id: currentTakeId,
        payload: { nodes, edges },
        reason: 'manual_save',
      })
    } catch (err) {
      console.error('Auto-persist failed:', err)
    }
  }, [projectId, shot.scene_id, shot.id, currentTakeId])

  const handleNodesChange = useCallback((nodes: CanvasNode[], edges: CanvasEdge[]) => {
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

  // Load shot-level derived state (FV + selections) — shot-scoped, not take-scoped
  const loadShotDerivedState = useCallback(async () => {
    const seq = ++shotDerivedSeqRef.current
    const [fv, sels] = await Promise.all([
      getShotFinalVisualAction({ shotId: shot.id }),
      getShotSelectionsAction({ shotId: shot.id }),
    ])
    if (seq !== shotDerivedSeqRef.current) return // stale response, discard
    setFinalVisual(fv)
    setFinalVisualTakeId(fv?.takeId ?? null)
    setShotSelections(sels)
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
      shotSelections.length === 0 && !finalVisual
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
        setReadyPayload(payload)
        setIsLoading(false)
      })
      .catch(() => {
        if (seq !== takeLoadSeqRef.current) return
        setReadyTakeId(currentTakeId)
        setReadyPayload(undefined)
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

      canvas.createNodeAt(x, y)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [])

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !canvasRef.current) return
    e.target.value = ''

    try {
      const dimensions = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        const img = new window.Image()
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
        img.onerror = reject
        img.src = URL.createObjectURL(file)
      })

      const supabase = createClient()
      const ext = file.name.split('.').pop() || 'png'
      const storagePath = `${projectId}/${shot.id}/${crypto.randomUUID()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('take-images')
        .upload(storagePath, file, { cacheControl: '3600', upsert: false })

      if (uploadError) {
        console.error('Upload failed:', uploadError)
        return
      }

      const { data: urlData } = supabase.storage
        .from('take-images')
        .getPublicUrl(storagePath)

      if (!urlData?.publicUrl) {
        console.error('Failed to get public URL')
        return
      }

      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getCanvasRect()
      if (!rect) return

      const imageData: ImageData = {
        src: urlData.publicUrl,
        storage_path: storagePath,
        naturalWidth: dimensions.w,
        naturalHeight: dimensions.h,
      }

      const cx = rect.width / 2
      const cy = rect.height / 2
      canvas.createImageNodeAt(cx, cy, imageData)
    } catch (err) {
      console.error('Image upload failed:', err)
    }
  }, [projectId, shot.id])

  // Step 1A — Video Upload
  const handleVideoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !canvasRef.current) return
    e.target.value = ''

    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop() || 'mp4'
      const storagePath = `${projectId}/${shot.id}/${crypto.randomUUID()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('take-videos')
        .upload(storagePath, file, { cacheControl: '3600', upsert: false })

      if (uploadError) {
        console.error('Video upload failed:', uploadError)
        return
      }

      const { data: urlData } = supabase.storage
        .from('take-videos')
        .getPublicUrl(storagePath)

      if (!urlData?.publicUrl) {
        console.error('Failed to get public URL')
        return
      }

      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getCanvasRect()
      if (!rect) return

      const videoData: VideoData = {
        src: urlData.publicUrl,
        storage_path: storagePath,
        filename: file.name,
        mime_type: file.type || 'video/mp4',
        size: file.size,
      }

      const cx = rect.width / 2
      const cy = rect.height / 2
      canvas.createVideoNodeAtScreen(cx, cy, videoData)
    } catch (err) {
      console.error('Video upload failed:', err)
    }
  }, [projectId, shot.id])

  const handleNewTake = async () => {
    try {
      const newTake = await createTakeAction({ projectId, shotId: shot.id })

      setTakes(prev => {
        const nextIndex = prev.length
        const localTake: Take = {
          id: newTake.id,
          shot_id: newTake.shot_id ?? shot.id,
          name: `Take ${nextIndex + 1}`,
          description: null,
          status: newTake.status,
          order_index: nextIndex,
          created_at: newTake.created_at,
          updated_at: newTake.created_at,
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

    // C) Sanitize: strip editorial markers from cloned nodes
    if (clonedPayload.nodes) {
      for (const node of clonedPayload.nodes) {
        if (node.data) {
          delete (node.data as any).promotedSelectionId
          delete (node.data as any).selectionNumber
          delete (node.data as any).isFinalVisual
        }
      }
    }

    try {
      const newTake = await createTakeAction({ projectId, shotId: shot.id })

      await saveTakeSnapshotAction({
        project_id: projectId,
        scene_id: shot.scene_id,
        shot_id: shot.id,
        take_id: newTake.id,
        payload: clonedPayload,
        reason: 'duplicate_take_seed',
      })

      setTakes(prev => {
        const nextIndex = prev.length
        const localTake: Take = {
          id: newTake.id,
          shot_id: newTake.shot_id ?? shot.id,
          name: `Take ${nextIndex + 1}`,
          description: null,
          status: newTake.status,
          order_index: nextIndex,
          created_at: newTake.created_at,
          updated_at: newTake.created_at,
        }
        return [...prev, localTake]
      })
      setCurrentTakeId(newTake.id)
    } catch (error) {
      console.error('Failed to duplicate take:', error)
    }
  }

  const handleDeleteTake = async (takeId: string) => {
    if (takes.length <= 1) return

    const targetTake = takes.find(t => t.id === takeId)
    const isFVTake = finalVisualTakeId === takeId
    const isOutputTake = shotOutputTakeId === takeId

    const warnings: string[] = []
    if (isFVTake) warnings.push('contains the Final Visual')
    if (isOutputTake) warnings.push('contains the Output Video')

    const message = warnings.length > 0
      ? `You're deleting "${targetTake?.name ?? 'this Take'}" which ${warnings.join(' and ')}.\n\nThis will also clear the Shot ${warnings.join(' and ')}.\n\nThis action is irreversible.`
      : `Eliminare "${targetTake?.name ?? 'questo Take'}"?\n\nQuesta azione è irreversibile.`

    if (!window.confirm(message)) return

    // FV guard: clear FV client-side first (FREEZED — do not modify)
    if (isFVTake) {
      await clearShotFinalVisualAction({ shotId: shot.id })
      setFinalVisual(null)
      setFinalVisualTakeId(null)
      fvUndoStackRef.current = []
      setFvUndoCount(0)
      router.refresh()
    }

    // Output guard: clear shot output if this take owns it
    if (isOutputTake) {
      await clearShotOutputVideo(shot.id)
      setShotOutputNodeId(null)
      setShotOutputSrc(null)
      setShotOutputTakeId(null)
    }

    const deletedId = takeId
    const remainingTakes = takes.filter(t => t.id !== deletedId)

    setTakes(remainingTakes)

    const deletedIndex = takes.findIndex(t => t.id === deletedId)
    const nextTake = remainingTakes[Math.min(deletedIndex, remainingTakes.length - 1)]
    setCurrentTakeId(nextTake.id)

    undoHistoryByTakeRef.current.delete(deletedId)

    try {
      // Atomic RPC: clears approved_take_id if needed + deletes take in one transaction.
      // Safe for non-approved takes (UPDATE is a no-op, DELETE proceeds normally).
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

  const handleOpenPLP = () => {
    if (!canvasRef.current) return
    const snap = canvasRef.current.getSnapshot()
    setPlpNodes(snap.nodes)
    setPlpEdges(snap.edges)
    setShowPLP(true)
  }

  // ── Blocco 4C: Shot Selection Promotion callbacks ──
  const handlePromoteSelection = useCallback(async (
    imageNodeId: string,
    imageData: ImageData,
    promptData?: { body: string; promptType: string; origin: string; createdAt?: string } | null
  ): Promise<{ selectionId: string; selectionNumber: number } | null> => {
    try {
      const result = await promoteAssetSelectionAction({
        projectId,
        shotId: shot.id,
        takeId: currentTakeId,
        imageSnapshot: {
          src: imageData.src,
          storage_path: imageData.storage_path,
          naturalWidth: imageData.naturalWidth,
          naturalHeight: imageData.naturalHeight,
        },
        promptSnapshot: promptData ?? null,
      })
      // Refresh selections after promote
      loadShotDerivedState()
      return result
    } catch (error) {
      console.error('Failed to promote selection:', error)
      return null
    }
  }, [projectId, shot.id, currentTakeId, loadShotDerivedState])

  const handleDiscardSelection = useCallback(async (selectionId: string, reason: 'undo' | 'manual'): Promise<void> => {
    if (!selectionId) return

    // If discarding the current Final Visual, clear FV first
    if (finalVisual?.selectionId === selectionId) {
      setFinalVisual(null)
      setFinalVisualTakeId(null)
      fvUndoStackRef.current = []
      setFvUndoCount(0)
      await clearShotFinalVisualAction({ shotId: shot.id })
      router.refresh()
    }

    try {
      await discardAssetSelectionAction({
        projectId,
        shotId: shot.id,
        selectionId,
        reason,
      })
      // Refresh selections after discard
      await loadShotDerivedState()
    } catch (error) {
      console.error('Failed to discard selection:', error)
    }
  }, [projectId, shot.id, finalVisual?.selectionId, loadShotDerivedState, router])

  // ── Shot Final Visual ──
  const fvUndoStackRef = useRef<{ selectionId: string | null; takeId: string | null }[]>([])
  const [fvUndoCount, setFvUndoCount] = useState(0)

  const handleSetFinalVisual = useCallback(async (selectionId: string) => {
    fvUndoStackRef.current.push({
      selectionId: finalVisual?.selectionId ?? null,
      takeId: finalVisualTakeId,
    })
    setFvUndoCount(fvUndoStackRef.current.length)
    const result = await setShotFinalVisualAction({ shotId: shot.id, selectionId })
    if (result.success) {
      await loadShotDerivedState()
      router.refresh()
    } else {
      fvUndoStackRef.current.pop()
      setFvUndoCount(fvUndoStackRef.current.length)
    }
  }, [shot.id, finalVisual, finalVisualTakeId, loadShotDerivedState, router])

  const handleUndoFinalVisual = useCallback(async () => {
    const prev = fvUndoStackRef.current.pop()
    setFvUndoCount(fvUndoStackRef.current.length)
    if (prev === undefined) return
    if (prev.selectionId === null) {
      const result = await clearShotFinalVisualAction({ shotId: shot.id })
      if (result.success) {
        setFinalVisual(null)
        setFinalVisualTakeId(null)
        router.refresh()
      }
    } else {
      const result = await setShotFinalVisualAction({ shotId: shot.id, selectionId: prev.selectionId })
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
      <SceneShotStrip
        key={shot.id}
        projectId={projectId}
        scenes={stripData.scenes}
        currentSceneId={stripData.currentSceneId}
        currentShotId={shot.id}
        sceneShots={stripData.sceneShots}
      />
    )
  }

  if (takes.length === 0) {
    return (
      <div className="flex-1 flex flex-col">
        {renderStrip()}
        <ShotHeader
          shot={shot}
          projectId={projectId}
          finalVisual={finalVisual}
          onUndoFinalVisual={fvUndoCount > 0 ? handleUndoFinalVisual : undefined}
          approvedTakeIndex={(() => { const idx = takes.findIndex(t => t.id === shot.approved_take_id); return idx >= 0 ? idx + 1 : null })()}
          onApprovedTakeClick={shot.approved_take_id ? () => setCurrentTakeId(shot.approved_take_id!) : undefined}
          outputVideoSrc={shotOutputSrc}
          onPreviewFV={finalVisual?.src ? () => setLightbox({ type: 'image', src: finalVisual.src }) : undefined}
          onPreviewOutput={shotOutputSrc ? () => setLightbox({ type: 'video', src: shotOutputSrc }) : undefined}
          onDownloadFV={finalVisual?.src ? () => triggerDownload(finalVisual.src, `S${pad2(sceneIndex)}_SH${pad2(shotIndex)}_FV.${extFromUrl(finalVisual.src, 'png')}`) : undefined}
          onDownloadOutput={shotOutputSrc ? () => triggerDownload(shotOutputSrc, `S${pad2(sceneIndex)}_SH${pad2(shotIndex)}_OUTPUT.${extFromUrl(shotOutputSrc, 'mp4')}`) : undefined}
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
  const currentUndoHistory = readyTakeId
    ? undoHistoryByTakeRef.current.get(readyTakeId)
    : undefined

  return (
    <div className="flex-1 flex flex-col">
      {renderStrip()}
      <ShotHeader
        shot={shot}
        projectId={projectId}
        finalVisual={finalVisual}
        onUndoFinalVisual={fvUndoCount > 0 ? handleUndoFinalVisual : undefined}
        approvedTakeIndex={(() => { const idx = takes.findIndex(t => t.id === shot.approved_take_id); return idx >= 0 ? idx + 1 : null })()}
        onApprovedTakeClick={shot.approved_take_id ? () => setCurrentTakeId(shot.approved_take_id!) : undefined}
        outputVideoSrc={shotOutputSrc}
        onPreviewFV={finalVisual?.src ? () => setLightbox({ type: 'image', src: finalVisual.src }) : undefined}
        onPreviewOutput={shotOutputSrc ? () => setLightbox({ type: 'video', src: shotOutputSrc }) : undefined}
        onDownloadFV={finalVisual?.src ? () => triggerDownload(finalVisual.src, `S${pad2(sceneIndex)}_SH${pad2(shotIndex)}_FV.${extFromUrl(finalVisual.src, 'png')}`) : undefined}
        onDownloadOutput={shotOutputSrc ? () => triggerDownload(shotOutputSrc, `S${pad2(sceneIndex)}_SH${pad2(shotIndex)}_OUTPUT.${extFromUrl(shotOutputSrc, 'mp4')}`) : undefined}
      />

      <TakeTabs
        takes={takes}
        currentTakeId={currentTakeId}
        onTakeChange={setCurrentTakeId}
        onNewTake={handleNewTake}
        onDuplicate={handleDuplicateTake}
        onDelete={handleDeleteTake}
        finalVisualTakeId={finalVisualTakeId}
        approvedTakeId={shot.approved_take_id}
        onApproveTake={handleApproveTake}
        onRevokeTake={handleRevokeTake}
        onOpenProduction={handleOpenPLP}
        isProductionReady={shot.approved_take_id === readyTakeId}
      />

      <div className="flex-1 flex">
        <aside className="w-12 bg-zinc-800 flex flex-col items-center py-2 gap-1 shrink-0">
          {/* Tool rail ALTO: azioni */}

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
            onClick={() => imageInputRef.current?.click()}
            className="w-9 h-9 bg-zinc-700 hover:bg-zinc-500 hover:scale-105 rounded flex items-center justify-center transition-all select-none"
            title="Upload image to canvas"
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
            onClick={() => videoInputRef.current?.click()}
            className="w-9 h-9 bg-zinc-700 hover:bg-zinc-500 hover:scale-105 rounded flex items-center justify-center transition-all select-none"
            title="Upload video to canvas"
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
                canvas.createColumnNodeAt(x, y)
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
                canvas.createPromptNodeAt(x, y)
              }

              window.addEventListener('mousemove', handleMouseMove)
              window.addEventListener('mouseup', handleMouseUp)
            }}
            className="w-9 h-9 bg-amber-900/50 hover:bg-amber-700/50 hover:scale-105 rounded flex items-center justify-center transition-all select-none"
            title="Drag to canvas to create Prompt"
          >
            <span className="text-[9px] text-amber-400 pointer-events-none">Prm</span>
          </button>
        </aside>

        <div className="flex-1 flex relative">
          {readyTakeId && (
            <TakeCanvas
              ref={canvasRef}
              key={readyTakeId}
              takeId={readyTakeId}
              initialNodes={readyPayload?.nodes}
              initialEdges={readyPayload?.edges}
              onNodesChange={handleNodesChange}
              initialUndoHistory={currentUndoHistory}
              onUndoHistoryChange={handleUndoHistoryChange}
              onPromoteSelection={handlePromoteSelection}
              onDiscardSelection={handleDiscardSelection}
              onSetFinalVisual={handleSetFinalVisual}
              onClearFinalVisual={async () => {
                await clearShotFinalVisualAction({ shotId: shot.id })
                setFinalVisual(null)
                setFinalVisualTakeId(null)
                fvUndoStackRef.current = []
                setFvUndoCount(0)
                router.refresh()
              }}
              currentFinalVisualId={finalVisual?.selectionId ?? null}
              outputVideoNodeId={shotOutputNodeId}
              onSetOutputVideo={async (nodeId: string, videoSrc: string) => {
                if (!readyTakeId) return
                await setShotOutputVideo(shot.id, nodeId, videoSrc, readyTakeId)
                setShotOutputNodeId(nodeId)
                setShotOutputSrc(videoSrc)
                setShotOutputTakeId(readyTakeId)
              }}
              onClearOutputVideo={async () => {
                await clearShotOutputVideo(shot.id)
                setShotOutputNodeId(null)
                setShotOutputSrc(null)
                setShotOutputTakeId(null)
              }}
              shotSelections={shotSelections}
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
          currentFinalVisualId={finalVisual?.selectionId ?? null}
          outputVideoNodeId={shotOutputNodeId}
          onClose={() => setShowPLP(false)}
        />
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

      {/* Lightbox overlay — preview only, owned by workspace client */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
          onClick={() => setLightbox(null)}
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {lightbox.type === 'image' ? (
              <img
                src={lightbox.src}
                alt="Final Visual preview"
                className="max-w-[90vw] max-h-[90vh] object-contain"
              />
            ) : (
              <video
                src={lightbox.src}
                controls
                autoPlay
                className="max-w-[90vw] max-h-[90vh] object-contain"
              />
            )}
            <button
              onClick={() => setLightbox(null)}
              className="absolute top-2 right-2 w-8 h-8 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center text-sm transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}