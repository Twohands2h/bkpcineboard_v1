'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ShotHeader } from './shot-header'
import { TakeTabs } from './take-tabs'
import { TakeCanvas, type TakeCanvasHandle, type CanvasNode, type UndoHistory } from '@/components/canvas/TakeCanvas'
import {
  saveTakeSnapshotAction,
  loadLatestTakeSnapshotAction,
} from '@/app/actions/take-snapshots'
import { createTakeAction } from '@/app/actions/takes'

// ===================================================
// SHOT WORKSPACE CLIENT — ORCHESTRATOR (R3.7 v2.0 + 004A + 005)
// ===================================================
// R3.7 v2.0: Auto-Persist via onNodesChange + debounce.
// R3.7-004A: Workspace owns undo history per Take (Map).
// R3.7-005: Duplica Take — clone nodes, create new Take.

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

  const [takes, setTakes] = useState<Take[]>(initialTakes)

  const defaultTakeId = takes.length > 0 ? takes[0].id : null
  const [currentTakeId, setCurrentTakeId] = useState<string | null>(defaultTakeId)

  const canvasRef = useRef<TakeCanvasHandle>(null)

  // ── R3.7 v2.0: Rehydration state ──
  const [initialPayload, setInitialPayload] = useState<CanvasNode[] | null | undefined>(undefined)

  // ── R3.7 v2.0: Debounce timer ref ──
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── R3.7-004A: Undo history per Take ──
  const undoHistoryByTakeRef = useRef<Map<string, UndoHistory>>(new Map())

  // ── R3.7 v2.0: Persist function ──
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

  // ── R3.7 v2.0: Debounced handler ──
  const handleNodesChange = useCallback((nodes: CanvasNode[]) => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current)
    }
    persistTimerRef.current = setTimeout(() => {
      persistNodes(nodes)
    }, 800)
  }, [persistNodes])

  // ── R3.7-004A: Handle undo history updates from canvas ──
  const handleUndoHistoryChange = useCallback((history: UndoHistory) => {
    if (currentTakeId) {
      undoHistoryByTakeRef.current.set(currentTakeId, history)
    }
  }, [currentTakeId])

  // ── R3.7 v2.0: Rehydration al mount / cambio Take ──
  useEffect(() => {
    if (!currentTakeId) return

    setInitialPayload(undefined)

    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current)
      persistTimerRef.current = null
    }

    loadLatestTakeSnapshotAction(currentTakeId)
      .then(snapshot => {
        if (snapshot?.payload) {
          setInitialPayload(snapshot.payload as CanvasNode[])
        } else {
          setInitialPayload(null)
        }
      })
      .catch(() => {
        setInitialPayload(null)
      })
  }, [currentTakeId])

  // ── Cleanup timer on unmount ──
  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current)
      }
    }
  }, [])

  // R3.6: New Take handler
  const handleNewTake = async () => {
    try {
      await createTakeAction({
        projectId,
        shotId: shot.id
      })

      router.refresh()
    } catch (error) {
      console.error('Failed to create take:', error)
    }
  }

  // ── R3.7-005: Duplica Take handler ──
  const handleDuplicateTake = async () => {
    if (!currentTakeId || !canvasRef.current) return

    // 1. Clone nodes da memoria PRIMA di qualsiasi write DB
    const clonedNodes = structuredClone(canvasRef.current.getSnapshot())

    try {
      // 2. Crea nuovo Take nel DB
      const newTake = await createTakeAction({
        projectId,
        shotId: shot.id
      })

      // 3. Persiste nodes clonati nel nuovo Take
      await saveTakeSnapshotAction({
        project_id: projectId,
        scene_id: shot.scene_id,
        shot_id: shot.id,
        take_id: newTake.id,
        payload: clonedNodes,
        reason: 'duplicate_take_seed',
      })

      // 4. Aggiorna lista Takes locale con adapter
      const localTake: Take = {
        id: newTake.id,
        shot_id: newTake.shot_id ?? shot.id,
        name: `Take ${takes.length + 1}`,
        description: null,
        status: newTake.status,
        order_index: takes.length,
        created_at: newTake.created_at,
        updated_at: newTake.created_at,
      }

      setTakes(prev => [...prev, localTake])

      // 5. Switch al nuovo Take (undo stack vuoto — nuovo contesto creativo)
      setCurrentTakeId(newTake.id)

    } catch (error) {
      console.error('Failed to duplicate take:', error)
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

  // ── R3.7-004A: Get stored history for current Take ──
  const currentUndoHistory = currentTakeId
    ? undoHistoryByTakeRef.current.get(currentTakeId)
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
      />

      {/* R3.7 v2.0: Canvas gated */}
      {currentTakeId && initialPayload !== undefined && (
        <TakeCanvas
          ref={canvasRef}
          key={currentTakeId}
          takeId={currentTakeId}
          initialNodes={initialPayload ?? undefined}
          onNodesChange={handleNodesChange}
          initialUndoHistory={currentUndoHistory}
          onUndoHistoryChange={handleUndoHistoryChange}
        />
      )}

      {/* R3.7 v2.0: Loading state */}
      {currentTakeId && initialPayload === undefined && (
        <div className="flex-1 flex items-center justify-center bg-zinc-950">
          <p className="text-zinc-600 text-sm">Loading...</p>
        </div>
      )}
    </div>
  )
}