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
import { setTakeOutputVideo, clearTakeOutputVideo } from '@/app/actions/take-output'
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
  const [isLoading, setIsLoading] = useState(true)
  const [shotSelections, setShotSelections] = useState<ActiveSelection[]>([])
  const [finalVisual, setFinalVisual] = useState<{ selectionId: string; src: string; storagePath: string; selectionNumber: number; takeId: string | null } | null>(null)
  const [finalVisualTakeId, setFinalVisualTakeId] = useState<string | null>(null)

  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null)
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const undoHistoryByTakeRef = useRef<Map<string, UndoHistory>>(new Map())
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const pendingDropRef = useRef<{ type: 'image' | 'video'; screenX: number; screenY: number } | null>(null)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const dragCounterRef = useRef(0)

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
        console.error('[DnD] Image upload failed:', uploadError)
        return
      }

      const { data: urlData } = supabase.storage
        .from('take-images')
        .getPublicUrl(storagePath)

      if (!urlData?.publicUrl) return

      if (!canvasRef.current) return
      canvasRef.current.createImageNodeAtScreen(drop.screenX, drop.screenY, {
        src: urlData.publicUrl,
        storage_path: storagePath,
        naturalWidth: dimensions.w,
        naturalHeight: dimensions.h,
      })
    } catch (err) {
      console.error('[DnD] Image upload failed:', err)
    }
  }, [projectId, shot.id])

  // Step 1A — Video Upload
  const handleVideoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const drop = pendingDropRef.current
    pendingDropRef.current = null
    e.target.value = ''

    if (!file || !canvasRef.current || !drop) return

    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop() || 'mp4'
      const storagePath = `${projectId}/${shot.id}/${crypto.randomUUID()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('take-videos')
        .upload(storagePath, file, { cacheControl: '3600', upsert: false })

      if (uploadError) {
        console.error('[DnD] Video upload failed:', uploadError)
        return
      }

      const { data: urlData } = supabase.storage
        .from('take-videos')
        .getPublicUrl(storagePath)

      if (!urlData?.publicUrl) return

      if (!canvasRef.current) return
      canvasRef.current.createVideoNodeAtScreen(drop.screenX, drop.screenY, {
        src: urlData.publicUrl,
        storage_path: storagePath,
        filename: file.name,
        mime_type: file.type || 'video/mp4',
        size: file.size,
      })
    } catch (err) {
      console.error('[DnD] Video upload failed:', err)
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
      for (const node of clonedPayload.nodes) {
        const oldId = node.id
        const newId = crypto.randomUUID()
        idMap.set(oldId, newId)
        node.id = newId

        // 2. Strip all editorial markers from node.data
        if (node.data) {
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

  const handleDeleteTake = async (takeId: string) => {
    const targetTake = takes.find(t => t.id === takeId)
    const isFVTake = finalVisualTakeId === takeId

    const message = isFVTake
      ? `You're deleting "${targetTake?.name ?? 'this Take'}" which contains the Final Visual.\n\nThis will also clear the Shot Final Visual (header + strip + take indicators).\n\nThis action is irreversible.`
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

    const deletedId = takeId
    const remainingTakes = takes.filter(t => t.id !== deletedId)

    setTakes(remainingTakes)

    if (remainingTakes.length > 0) {
      const deletedIndex = takes.findIndex(t => t.id === deletedId)
      const nextTake = remainingTakes[Math.min(deletedIndex, remainingTakes.length - 1)]
      setCurrentTakeId(nextTake.id)
    } else {
      // Zero-takes state: clear current take, canvas won't mount
      setCurrentTakeId(null as any)
      setReadyTakeId(null)
      setReadyPayload(undefined)
    }

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
        imageNodeId,
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
        <ShotHeader shot={shot} projectId={projectId} finalVisual={finalVisual} onUndoFinalVisual={fvUndoCount > 0 ? handleUndoFinalVisual : undefined} />
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
      <ShotHeader shot={shot} projectId={projectId} finalVisual={finalVisual} onUndoFinalVisual={fvUndoCount > 0 ? handleUndoFinalVisual : undefined} />

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

            // Case B: External file drop (from OS) — call upload pipeline directly
            const files = Array.from(e.dataTransfer.files)
            if (files.length === 0) return
            const file = files[0]
            const isImage = file.type.startsWith('image/')
            const isVideo = file.type.startsWith('video/')
            if (!isImage && !isVideo) {
              console.warn('[DnD] Unsupported file type:', file.type)
              return
            }
            pendingDropRef.current = { type: isImage ? 'image' : 'video', screenX, screenY }

            // Upload directly — same pipeline as picker onChange
            const drop = pendingDropRef.current
            pendingDropRef.current = null

            try {
              const supabase = createClient()

              if (isImage) {
                const dimensions = await new Promise<{ w: number; h: number }>((resolve, reject) => {
                  const img = new window.Image()
                  img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
                  img.onerror = reject
                  img.src = URL.createObjectURL(file)
                })

                const ext = file.name.split('.').pop() || 'png'
                const storagePath = `${projectId}/${shot.id}/${crypto.randomUUID()}.${ext}`
                const { error: uploadError } = await supabase.storage
                  .from('take-images')
                  .upload(storagePath, file, { cacheControl: '3600', upsert: false })
                if (uploadError) { console.error('[DnD] Image upload failed:', uploadError); return }

                const { data: urlData } = supabase.storage.from('take-images').getPublicUrl(storagePath)
                if (!urlData?.publicUrl) return

                canvasRef.current?.createImageNodeAtScreen(drop.screenX, drop.screenY, {
                  src: urlData.publicUrl,
                  storage_path: storagePath,
                  naturalWidth: dimensions.w,
                  naturalHeight: dimensions.h,
                })
              } else {
                const ext = file.name.split('.').pop() || 'mp4'
                const storagePath = `${projectId}/${shot.id}/${crypto.randomUUID()}.${ext}`
                const { error: uploadError } = await supabase.storage
                  .from('take-videos')
                  .upload(storagePath, file, { cacheControl: '3600', upsert: false })
                if (uploadError) { console.error('[DnD] Video upload failed:', uploadError); return }

                const { data: urlData } = supabase.storage.from('take-videos').getPublicUrl(storagePath)
                if (!urlData?.publicUrl) return

                canvasRef.current?.createVideoNodeAtScreen(drop.screenX, drop.screenY, {
                  src: urlData.publicUrl,
                  storage_path: storagePath,
                  filename: file.name,
                  mime_type: file.type || 'video/mp4',
                  size: file.size,
                })
              }
            } catch (err) {
              console.error('[DnD] Upload failed:', err)
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
              outputVideoNodeId={currentTake?.output_video_node_id ?? null}
              onSetOutputVideo={async (nodeId: string) => {
                if (!readyTakeId) return
                await setTakeOutputVideo(readyTakeId, nodeId)
                setTakes(prev => prev.map(t => t.id === readyTakeId ? { ...t, output_video_node_id: nodeId } : t))
              }}
              onClearOutputVideo={async () => {
                if (!readyTakeId) return
                await clearTakeOutputVideo(readyTakeId)
                setTakes(prev => prev.map(t => t.id === readyTakeId ? { ...t, output_video_node_id: null } : t))
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
          outputVideoNodeId={currentTake?.output_video_node_id ?? null}
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
    </div>
  )
}