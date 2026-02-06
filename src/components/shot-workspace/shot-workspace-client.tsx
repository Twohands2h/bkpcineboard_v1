'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ShotHeader } from './shot-header'
import { TakeTabs } from './take-tabs'
import { TakeCanvas, type TakeCanvasHandle } from '@/components/canvas/TakeCanvas'
import { createTakeAction } from '@/app/actions/takes'

// ===================================================
// SHOT WORKSPACE CLIENT — ORCHESTRATOR (R3.7 v2.0)
// ===================================================
// R3.7 v2.0: Rimossi Save/Snapshot/Restore/Dirty dalla UI.
// Il canvas è puro strumento visivo.
// Auto-persist verrà aggiunto in Step 1.

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

      {currentTakeId && (
        <TakeCanvas
          ref={canvasRef}
          key={currentTakeId}
          takeId={currentTakeId}
        />
      )}
    </div>
  )
}