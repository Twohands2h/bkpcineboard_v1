'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ShotHeader } from './shot-header'
import { TakeTabs } from './take-tabs'
import { TakeCanvas, type TakeCanvasHandle, type CanvasNode, type UndoHistory } from '@/components/canvas/TakeCanvas'
import {
  saveTakeSnapshotAction,
  loadLatestTakeSnapshotAction,
} from '@/app/actions/take-snapshots'
import { createTakeAction, deleteTakeAction } from '@/app/actions/takes'

// ===================================================
// SHOT WORKSPACE CLIENT — ORCHESTRATOR (R3.8-002)
// ===================================================
// R3.8-002: Delete Take with confirmation.

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

export function ShotWorkspaceClient({ shot, takes: initialTakes, projectId }: ShotWorkspaceClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [takes, setTakes] = useState<Take[]>(initialTakes)

  // R3.8-001A: Inizializza da URL con fallback
  const takeFromUrl = searchParams.get('take')
  const defaultTakeId = (takeFromUrl && takes.some(t => t.id === takeFromUrl))
    ? takeFromUrl
    : (takes.length > 0 ? takes[0].id : null)
  const [currentTakeId, setCurrentTakeId] = useState<string | null>(defaultTakeId)

  // R3.8-001A: Sync state → URL
  useEffect(() => {
    if (!currentTakeId) return
    const current = searchParams.get('take')
    if (current !== currentTakeId) {
      router.replace(`?take=${currentTakeId}`, { scroll: false })
    }
  }, [currentTakeId, searchParams, router])

  const canvasRef = useRef<TakeCanvasHandle>(null)

  // ── Smooth transition ──
  const [readyTakeId, setReadyTakeId] = useState<string | null>(null)
  const [readyPayload, setReadyPayload] = useState<CanvasNode[] | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)

  // ── Ghost drag ──
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null)

  // ── Debounce timer ──
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Undo history per Take ──
  const undoHistoryByTakeRef = useRef<Map<string, UndoHistory>>(new Map())

  // ── Persist function ──
  const persistNodes = useCallback(async (nodes: CanvasNode[]) => {
    if (!currentTakeId) return
    try {
      await saveTakeSnapshotAction({
        project_id: projectId,
        scene_id: shot.scene_id,
        shot_id: shot.id,
        take_id: currentTakeId,
        payload: nodes,
        reason: 'manual_save',
      })
    } catch (err) {
      console.error('Auto-persist failed:', err)
    }
  }, [projectId, shot.scene_id, shot.id, currentTakeId])

  // ── Debounced handler ──
  const handleNodesChange = useCallback((nodes: CanvasNode[]) => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current)
    }
    persistTimerRef.current = setTimeout(() => {
      persistNodes(nodes)
    }, 800)
  }, [persistNodes])

  // ── Undo history updates ──
  const handleUndoHistoryChange = useCallback((history: UndoHistory) => {
    if (currentTakeId) {
      undoHistoryByTakeRef.current.set(currentTakeId, history)
    }
  }, [currentTakeId])

  // ── Load snapshot, swap atomically ──
  useEffect(() => {
    if (!currentTakeId) return

    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current)
      persistTimerRef.current = null
    }

    setIsLoading(true)

    loadLatestTakeSnapshotAction(currentTakeId)
      .then(snapshot => {
        const payload = snapshot?.payload
          ? (snapshot.payload as CanvasNode[])
          : undefined

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

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current)
      }
    }
  }, [])

  // ── Drag from sidebar ──
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

  // ── New Take ──
  const handleNewTake = async () => {
    try {
      const newTake = await createTakeAction({
        projectId,
        shotId: shot.id
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
      console.error('Failed to create take:', error)
    }
  }

  // ── Duplica Take ──
  const handleDuplicateTake = async () => {
    if (!currentTakeId || !canvasRef.current) return

    const clonedNodes = structuredClone(canvasRef.current.getSnapshot())

    try {
      const newTake = await createTakeAction({
        projectId,
        shotId: shot.id
      })

      await saveTakeSnapshotAction({
        project_id: projectId,
        scene_id: shot.scene_id,
        shot_id: shot.id,
        take_id: newTake.id,
        payload: clonedNodes,
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

  // ── R3.8-002: Delete Take ──
  const handleDeleteTake = async (takeId: string) => {
    if (takes.length <= 1) return

    const targetTake = takes.find(t => t.id === takeId)
    const confirmed = window.confirm(
      `Eliminare "${targetTake?.name ?? 'questo Take'}"?\n\nQuesta azione è irreversibile.`
    )
    if (!confirmed) return

    const deletedId = takeId
    const remainingTakes = takes.filter(t => t.id !== deletedId)

    // 1. UI immediata: rimuovi dalla lista e switch
    setTakes(remainingTakes)

    // Switch al Take precedente o successivo
    const deletedIndex = takes.findIndex(t => t.id === deletedId)
    const nextTake = remainingTakes[Math.min(deletedIndex, remainingTakes.length - 1)]
    setCurrentTakeId(nextTake.id)

    // Cleanup undo history del Take eliminato
    undoHistoryByTakeRef.current.delete(deletedId)

    // 2. DB in background
    try {
      await deleteTakeAction({
        projectId,
        shotId: shot.id,
        takeId: deletedId,
      })
    } catch (error) {
      console.error('Failed to delete take:', error)
      // Rollback: riaggiungi il Take alla lista
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
            <p className="text-zinc-500 text-sm mb-4">
              Nessun Take presente per questo Shot
            </p>
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

      {/* Sidebar + Canvas */}
      <div className="flex-1 flex">
        {/* Tool Rail — always visible */}
        <aside className="w-12 bg-zinc-800 flex flex-col items-center py-2 gap-1 shrink-0">
          <button
            onMouseDown={handleSidebarNoteMouseDown}
            className="w-9 h-9 bg-zinc-700 hover:bg-zinc-500 hover:scale-105 rounded flex items-center justify-center transition-all select-none"
            title="Drag to canvas to create Note"
          >
            <span className="text-xs text-zinc-400 pointer-events-none">Note</span>
          </button>
        </aside>

        {/* Canvas area */}
        <div className="flex-1 flex relative">
          {readyTakeId && (
            <TakeCanvas
              ref={canvasRef}
              key={readyTakeId}
              takeId={readyTakeId}
              initialNodes={readyPayload}
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

      {/* Ghost node during sidebar drag */}
      {ghostPos && (
        <div
          className="fixed pointer-events-none z-[9999]"
          style={{
            left: ghostPos.x - 100,
            top: ghostPos.y - 60,
            width: 200,
            height: 120,
          }}
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