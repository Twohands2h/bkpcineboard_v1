'use client'

import { useState, useRef, useEffect } from 'react'
import { ShotHeader } from './shot-header'
import { TakeTabs } from './take-tabs'
import { TakeCanvas, type TakeCanvasHandle } from '@/components/canvas/TakeCanvas'
import { RestoreConfirmModal } from './restore-confirm-modal'
import { 
  saveTakeSnapshotAction, 
  loadAllTakeSnapshotsAction,
  createTakeFromSnapshotAction 
} from '@/app/actions/take-snapshots'

// ===================================================
// SHOT WORKSPACE CLIENT — ORCHESTRATOR (R3.3 + R3.4 + R3.5 + R3.6)
// ===================================================

interface Shot {
  id: string
  shot_number: string
  title: string | null
  description: string | null
  status: string | null
  shotlist_id: string
  shot_type: string | null
  entity_references: unknown
  order_index: number
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

interface Snapshot {
  id: string
  reason: string
  created_at: string
}

type SaveStatus = 'idle' | 'saving' | 'success'

interface ShotWorkspaceClientProps {
  shot: Shot
  takes: Take[]  // R3.6: sarà aggiornata con nuovo Take dopo restore
  projectId: string  // R3.4: necessario per saveTakeSnapshot
}

export function ShotWorkspaceClient({ shot, takes: initialTakes, projectId }: ShotWorkspaceClientProps) {
  // R3.6: takes locale per gestire nuovo Take da restore
  const [takes, setTakes] = useState<Take[]>(initialTakes)
  
  // Default: primo Take per created_at, oppure null se array vuoto
  const defaultTakeId = takes.length > 0 ? takes[0].id : null
  const [currentTakeId, setCurrentTakeId] = useState<string | null>(defaultTakeId)

  // ── R3.4: Dirty State + Canvas Ref ──
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const canvasRef = useRef<TakeCanvasHandle>(null)

  // ── R3.5: Save feedback + Snapshot history ──
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [showHistory, setShowHistory] = useState(false)

  // ── R3.6: Restore flow ──
  const [restoredSnapshot, setRestoredSnapshot] = useState<unknown | null>(null)
  const [showRestoreModal, setShowRestoreModal] = useState(false)
  const [pendingRestoreSnapshotId, setPendingRestoreSnapshotId] = useState<string | null>(null)

  // ── R3.4: Guard uscita con modifiche non salvate ──
  useEffect(() => {
    if (!isDirty) return

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  // ── R3.4: Reset dirty su cambio Take ──
  useEffect(() => {
    setIsDirty(false)
  }, [currentTakeId])

  // ── R3.5: Carica snapshot history su cambio Take ──
  useEffect(() => {
    if (!currentTakeId) return

    loadAllTakeSnapshotsAction(currentTakeId, 10)
      .then(setSnapshots)
      .catch(err => {
        console.error('Failed to load snapshots:', err)
        setSnapshots([])
      })
  }, [currentTakeId])

  // ── R3.6: Reset restoredSnapshot dopo cambio Take ──
  // CRITICAL: Questo previene re-inizializzazioni accidentali
  // restoredSnapshot serve SOLO al primo mount del nuovo Take
  useEffect(() => {
    if (restoredSnapshot) {
      // Reset dopo frame successivo (canvas già montato)
      const timer = setTimeout(() => {
        setRestoredSnapshot(null)
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [currentTakeId, restoredSnapshot])

  // ── R3.4 + R3.5: Save handler con feedback migliorato ──
  const handleSave = async () => {
    if (!currentTakeId || !canvasRef.current) return
    if (isSaving) return  // Protezione doppio click

    setIsSaving(true)
    setSaveStatus('saving')
    
    try {
      const nodes = canvasRef.current.getSnapshot()
      
      await saveTakeSnapshotAction({
        project_id: projectId,
        scene_id: shot.shotlist_id,
        shot_id: shot.id,
        take_id: currentTakeId,
        payload: nodes,
        reason: 'manual_save',
      })
      
      setIsDirty(false)
      setSaveStatus('success')
      
      // R3.5: Ricarica snapshot history dopo save
      loadAllTakeSnapshotsAction(currentTakeId, 10)
        .then(setSnapshots)
        .catch(console.error)
      
      // R3.5: Reset status a idle dopo 2s
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

  // ── R3.6: Restore handlers ──
  const handleRestoreRequest = (snapshotId: string) => {
    setPendingRestoreSnapshotId(snapshotId)
    setShowRestoreModal(true)
  }

  const handleRestoreConfirm = async () => {
    if (!pendingRestoreSnapshotId) return

    setShowRestoreModal(false)
    
    try {
      // Crea nuovo Take da snapshot (branch)
      const result = await createTakeFromSnapshotAction(pendingRestoreSnapshotId)
      
      // Aggiorna lista takes (append)
      const newTake: Take = {
        id: result.take.id,
        shot_id: result.take.shot_id,
        name: result.take.name,
        description: null,
        status: result.take.status as any,
        order_index: result.take.order_index,
        created_at: result.take.created_at,
        updated_at: result.take.updated_at,
      }
      
      setTakes(prev => [...prev, newTake])
      
      // Switch automatico su nuovo Take
      setCurrentTakeId(result.take.id)
      
      // Imposta snapshot payload per initialNodes
      setRestoredSnapshot(result.snapshot.payload)
      
      // Reset dirty/save status (nessun transfer)
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

  // ============================================
  // CASE: Zero Takes — CTA
  // ============================================
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
                // TODO R3.4+: implementare creazione Take
                console.log('Create first Take - not implemented in R3.3')
              }}
            >
              Crea il primo Take
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ============================================
  // CASE: Takes presenti — Workspace completo
  // ============================================
  return (
    <div className="flex-1 flex flex-col">
      {/* Header fisso */}
      <ShotHeader shot={shot} />

      {/* Take Tabs */}
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

      {/* Save Bar - R3.5: feedback migliorato */}
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
        
        {/* R3.5: Status feedback dinamico */}
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

      {/* Canvas Area */}
      {currentTakeId && (
        <TakeCanvas
          ref={canvasRef}
          key={currentTakeId}
          takeId={currentTakeId}
          initialNodes={restoredSnapshot as any}
          onDirty={() => setIsDirty(true)}
        />
      )}

      {/* R3.6: Restore confirmation modal */}
      {showRestoreModal && (
        <RestoreConfirmModal
          onConfirm={handleRestoreConfirm}
          onCancel={handleRestoreCancel}
        />
      )}
    </div>
  )
}
