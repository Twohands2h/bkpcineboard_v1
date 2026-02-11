'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ShotHeader } from './shot-header'
import { TakeTabs } from './take-tabs'
import { TakeCanvas, type TakeCanvasHandle, type CanvasNode, type CanvasEdge, type UndoHistory } from '@/components/canvas/TakeCanvas'
import type { ImageData } from '@/components/canvas/NodeContent'
import {
  saveTakeSnapshotAction,
  loadLatestTakeSnapshotAction,
} from '@/app/actions/take-snapshots'
import { createTakeAction, deleteTakeAction } from '@/app/actions/takes'
import { createClient } from '@/lib/supabase/client'

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
}

interface ShotWorkspaceClientProps {
  shot: Shot
  takes: Take[]
  projectId: string
}

interface SnapshotPayload {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

export function ShotWorkspaceClient({ shot, takes: initialTakes, projectId }: ShotWorkspaceClientProps) {
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
  }, [currentTakeId, searchParams, router])

  const canvasRef = useRef<TakeCanvasHandle>(null)

  const [readyTakeId, setReadyTakeId] = useState<string | null>(null)
  const [readyPayload, setReadyPayload] = useState<SnapshotPayload | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)

  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null)
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const undoHistoryByTakeRef = useRef<Map<string, UndoHistory>>(new Map())
  const imageInputRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    if (!currentTakeId) return

    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current)
      persistTimerRef.current = null
    }

    setIsLoading(true)

    loadLatestTakeSnapshotAction(currentTakeId)
      .then(snapshot => {
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
        setReadyTakeId(currentTakeId)
        setReadyPayload(undefined)
        setIsLoading(false)
      })
  }, [currentTakeId])

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
    const confirmed = window.confirm(
      `Eliminare "${targetTake?.name ?? 'questo Take'}"?\n\nQuesta azione è irreversibile.`
    )
    if (!confirmed) return

    const deletedId = takeId
    const remainingTakes = takes.filter(t => t.id !== deletedId)

    setTakes(remainingTakes)

    const deletedIndex = takes.findIndex(t => t.id === deletedId)
    const nextTake = remainingTakes[Math.min(deletedIndex, remainingTakes.length - 1)]
    setCurrentTakeId(nextTake.id)

    undoHistoryByTakeRef.current.delete(deletedId)

    try {
      await deleteTakeAction({ projectId, shotId: shot.id, takeId: deletedId })
    } catch (error) {
      console.error('Failed to delete take:', error)
      setTakes(takes)
      setCurrentTakeId(deletedId)
    }
  }

  if (takes.length === 0) {
    return (
      <div className="flex-1 flex flex-col">
        <ShotHeader shot={shot} projectId={projectId} />
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

  const currentUndoHistory = readyTakeId
    ? undoHistoryByTakeRef.current.get(readyTakeId)
    : undefined

  return (
    <div className="flex-1 flex flex-col">
      <ShotHeader shot={shot} projectId={projectId} />

      <TakeTabs
        takes={takes}
        currentTakeId={currentTakeId}
        onTakeChange={setCurrentTakeId}
        onNewTake={handleNewTake}
        onDuplicate={handleDuplicateTake}
        onDelete={handleDeleteTake}
      />

      <div className="flex-1 flex">
        <aside className="w-12 bg-zinc-800 flex flex-col items-center py-2 gap-1 shrink-0">
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
            />
          )}

          {isLoading && (
            <div className="absolute inset-0 bg-zinc-950 flex items-center justify-center z-10">
              <p className="text-zinc-600 text-sm">Loading...</p>
            </div>
          )}
        </div>
      </div>

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