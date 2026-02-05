'use client'

import { useState, useRef, useEffect } from 'react'
import { ShotHeader } from './shot-header'
import { TakeTabs } from './take-tabs'
import { TakeCanvas, type TakeCanvasHandle } from '@/components/canvas/TakeCanvas'
import { RestoreConfirmModal } from './restore-confirm-modal'
import type { CanvasNode } from '@/components/canvas/types'
import {
  saveTakeSnapshotAction,
  loadAllTakeSnapshotsAction,
  createTakeFromSnapshotAction
} from '@/app/actions/take-snapshots'
import type { Shot } from '@/lib/db/queries/shots'

// ===================================================
// SHOT WORKSPACE CLIENT — ORCHESTRATOR (R3.3 + R3.4 + R3.5 + R3.6)
// ===================================================

type TakeDB = {
  id: string
  shot_id: string | null
  project_id: string
  media_type: string
  source: string | null
  status: string
  created_at: string
}

// UI-only type: mappa Take DB → interfaccia workspace
interface WorkspaceTake {
  id: string
  shot_id: string
  name: string
  description: string | null
  status: string
  order_index: number
  created_at: string
  updated_at: string
}

interface Snapshot {
  id: string
  reason: string
  created_at: string
}

type SaveStatus = 'idle' | 'saving' | 'success'

interface ShotWorkspaceClientProps {
  shot: Shot
  takes: TakeDB[]
  projectId: string
}

// Helper: mappa Take DB → WorkspaceTake UI
function mapToWorkspaceTakes(dbTakes: TakeDB[]): WorkspaceTake[] {
  return dbTakes.map((t, index) => ({
    id: t.id,
    shot_id: t.shot_id || '',
    name: `Take ${index + 1}`,
    description: null,
    status: t.status,
    order_index: index + 1,
    created_at: t.created_at,
    updated_at: t.created_at,
  }))
}

export function ShotWorkspaceClient({ shot, takes: dbTakes, projectId }: ShotWorkspaceClientProps) {
  const [takes, setTakes] = useState<WorkspaceTake[]>(mapToWorkspaceTakes(dbTakes))

  const defaultTakeId = takes.length > 0 ? takes[0].id : null
  const [currentTakeId, setCurrentTakeId] = useState<string | null>(defaultTakeId)

  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const canvasRef = useRef<TakeCanvasHandle>(null)

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [showHistory, setShowHistory] = useState(false)

  const [restoredSnapshot, setRestoredSnapshot] = useState<CanvasNode[] | null>(null)
  const [showRestoreModal, setShowRestoreModal] = useState(false)
  const [pendingRestoreSnapshotId, setPendingRestoreSnapshotId] = useState<string | null>(null)

  useEffect(() => {
    if (!isDirty) return

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  useEffect(() => {
    setIsDirty(false)
  }, [currentTakeId])

  useEffect(() => {
    if (!currentTakeId) return

    loadAllTakeSnapshotsAction(currentTakeId, 10)
      .then(setSnapshots)
      .catch(err => {
        console.error('Failed to load snapshots:', err)
        setSnapshots([])
      })
  }, [currentTakeId])

  useEffect(() => {
    if (restoredSnapshot) {
      const timer = setTimeout(() => {
        setRestoredSnapshot(null)
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [currentTakeId, restoredSnapshot])

  const handleSave = async () => {
    if (!currentTakeId || !canvasRef.current) return
    if (isSaving) return

    setIsSaving(true)
    setSaveStatus('saving')

    try {
      const nodes = canvasRef.current.getSnapshot()

      await saveTakeSnapshotAction({
        project_id: projectId,
        scene_id: shot.scene_id,
        shot_id: shot.id,
        take_id: currentTakeId,
        payload: nodes,
        reason: 'manual_save',
      })

      setIsDirty(false)
      setSaveStatus('success')

      loadAllTakeSnapshotsAction(currentTakeId, 10)
        .then(setSnapshots)
        .catch(console.error)

      setTimeout(() => {
        setSaveStatus('idle')
      }, 2000)

    } catch (error) {
      console.error('Failed to save snapshot:', error)
      setSaveStatus('idle')
    } finally {
      setIsSaving(false)
    }
  }

  const handleRestoreRequest = (snapshotId: string) => {
    setPendingRestoreSnapshotId(snapshotId)
    setShowRestoreModal(true)
  }

  const handleRestoreConfirm = async () => {
    if (!pendingRestoreSnapshotId) return

    setShowRestoreModal(false)

    try {
      const result = await createTakeFromSnapshotAction(pendingRestoreSnapshotId)

      const newWorkspaceTake: WorkspaceTake = {
        id: result.take.id,
        shot_id: result.take.shot_id || '',
        name: `Take ${takes.length + 1}`,
        description: null,
        status: result.take.status,
        order_index: takes.length + 1,
        created_at: result.take.created_at,
        updated_at: result.take.created_at,
      }

      setTakes(prev => [...prev, newWorkspaceTake])
      setCurrentTakeId(result.take.id)
      setRestoredSnapshot(result.snapshot.payload as CanvasNode[])
      setIsDirty(false)
      setSaveStatus('idle')

    } catch (error) {
      console.error('Failed to restore snapshot:', error)
    } finally {
      setPendingRestoreSnapshotId(null)
    }
  }

  const handleRestoreCancel = () => {
    setShowRestoreModal(false)
    setPendingRestoreSnapshotId(null)
  }

  if (takes.length === 0) {
    return (
      <div className="flex-1 flex flex-col">
        <ShotHeader shot={shot} />

        <div className="flex-1 flex items-center justify-center bg-zinc-950">
          <div className="text-center">
            <p className="text-zinc-500 text-sm mb-4">
              Nessun Take presente per questo Shot
            </p>
            <button
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded text-sm transition-colors"
              onClick={() => {
                console.log('Create first Take - not implemented')
              }}
            >
              Crea il primo Take
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">

      <ShotHeader shot={shot} />

      <TakeTabs
        takes={takes}
        currentTakeId={currentTakeId}
        onTakeChange={setCurrentTakeId}
        isDirty={isDirty}
        snapshots={snapshots}
        showHistory={showHistory}
        onToggleHistory={() => setShowHistory(!showHistory)}
        onRestore={handleRestoreRequest}
      />

      <div className="h-12 bg-zinc-900 border-b border-zinc-800 flex items-center px-4 gap-3 shrink-0">
        <button
          onClick={handleSave}
          disabled={!isDirty || isSaving}
          className={`
            px-4 py-1.5 rounded text-sm font-medium transition-colors
            ${(isDirty && !isSaving)
              ? 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer'
              : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
            }
          `}
        >
          {saveStatus === 'saving' ? 'Saving...' : 'Save'}
        </button>

        {saveStatus === 'idle' && isDirty && (
          <span className="text-xs text-zinc-500">
            Modifiche non salvate
          </span>
        )}
        {saveStatus === 'success' && (
          <span className="text-xs text-green-500">
            ✓ Saved
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {currentTakeId && (
          <TakeCanvas
            ref={canvasRef}
            key={currentTakeId}
            takeId={currentTakeId}
            initialNodes={restoredSnapshot ?? undefined}
            onDirty={() => setIsDirty(true)}
          />
        )}
      </div>

      {showRestoreModal && (
        <RestoreConfirmModal
          onConfirm={handleRestoreConfirm}
          onCancel={handleRestoreCancel}
        />
      )}
    </div>
  )
}
