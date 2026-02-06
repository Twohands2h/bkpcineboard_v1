'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ShotHeader } from './shot-header'
import { TakeTabs } from './take-tabs'
import { TakeCanvas, type TakeCanvasHandle, type CanvasNode } from '@/components/canvas/TakeCanvas'
import {
  saveTakeSnapshotAction,
  loadLatestTakeSnapshotAction,
} from '@/app/actions/take-snapshots'
import { createTakeAction } from '@/app/actions/takes'

// ===================================================
// SHOT WORKSPACE CLIENT — ORCHESTRATOR (R3.7 v2.0)
// ===================================================
// R3.7 v2.0: Auto-Persist via onNodesChange + debounce.
// DB = write-only dopo mount. Rehydration con stato ternario.

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
  // undefined = loading, null = loaded empty, CanvasNode[] = loaded with data
  const [initialPayload, setInitialPayload] = useState<CanvasNode[] | null | undefined>(undefined)

  // ── R3.7 v2.0: Debounce timer ref ──
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── R3.7 v2.0: Persist function (fire-and-forget) ──
  const persistNodes = useCallback(async (nodes: CanvasNode[]) => {
    if (!currentTakeId) return
    try {
      await saveTakeSnapshotAction({
        project_id: projectId,
        scene_id: shot.scene_id,
        shot_id: shot.id,
        take_id: currentTakeId,
        payload: nodes,
        reason: 'manual_save',  // riusa reason esistente, auto_persist quando ENUM aggiornato
      })
    } catch (err) {
      console.error('Auto-persist failed:', err)
    }
  }, [projectId, shot.scene_id, shot.id, currentTakeId])

  // ── R3.7 v2.0: Debounced handler ricevuto dal canvas ──
  const handleNodesChange = useCallback((nodes: CanvasNode[]) => {
    // Cancella timer precedente
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current)
    }
    // Nuovo timer: persiste dopo 800ms di inattività
    persistTimerRef.current = setTimeout(() => {
      persistNodes(nodes)
    }, 800)
  }, [persistNodes])

  // ── R3.7 v2.0: Rehydration al mount / cambio Take ──
  useEffect(() => {
    if (!currentTakeId) return

    // Reset: canvas smontato durante il caricamento
    setInitialPayload(undefined)

    // Cleanup timer precedente
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
        setInitialPayload(null)  // errore → canvas vuoto
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

  return (
    <div className="flex-1 flex flex-col">
      <ShotHeader shot={shot} projectId={projectId} />

      <TakeTabs
        takes={takes}
        currentTakeId={currentTakeId}
        onTakeChange={setCurrentTakeId}
        onNewTake={handleNewTake}
      />

      {/* R3.7 v2.0: Canvas gated — non montato finché rehydration non completa */}
      {currentTakeId && initialPayload !== undefined && (
        <TakeCanvas
          ref={canvasRef}
          key={currentTakeId}
          takeId={currentTakeId}
          initialNodes={initialPayload ?? undefined}
          onNodesChange={handleNodesChange}
        />
      )}

      {/* R3.7 v2.0: Loading state durante rehydration */}
      {currentTakeId && initialPayload === undefined && (
        <div className="flex-1 flex items-center justify-center bg-zinc-950">
          <p className="text-zinc-600 text-sm">Loading...</p>
        </div>
      )}
    </div>
  )
}