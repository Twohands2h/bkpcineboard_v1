'use client'

import { useState, useEffect, useTransition } from 'react'
import {
  getEntitiesForWorkspaceAction,
  getShotsForWorkspaceAction,
  setBoardAsWorkspaceAction
} from '@/app/actions/board-links'

// ============================================
// TYPES
// ============================================

interface SetWorkspaceDialogProps {
  isOpen: boolean
  onClose: () => void
  boardId: string
  projectId: string
  onSuccess: () => void
}

interface EntityOption {
  id: string
  name: string
  type: string
  has_workspace: boolean
}

interface ShotOption {
  id: string
  title: string  // Da board-links action (visual_description)
  shot_number: string  // Da board-links action (order_index come string)
  has_workspace: boolean
}

// ============================================
// TYPE ICONS
// ============================================

const TYPE_ICONS: Record<string, string> = {
  character: '👤',
  environment: '🌍',
  asset: '📦',
}

// ============================================
// SET WORKSPACE DIALOG
// ============================================

/**
 * Dialog minimale per impostare una Board come workspace
 * 
 * - Step 1: Scegli Entity o Shot
 * - Step 2: Seleziona target
 * - Conferma automatica
 */
export function SetWorkspaceDialog({
  isOpen,
  onClose,
  boardId,
  projectId,
  onSuccess
}: SetWorkspaceDialogProps) {
  const [isPending, startTransition] = useTransition()
  const [targetType, setTargetType] = useState<'entity' | 'shot' | null>(null)
  const [entities, setEntities] = useState<EntityOption[]>([])
  const [shots, setShots] = useState<ShotOption[]>([])
  const [loading, setLoading] = useState(false)

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setTargetType(null)
      setEntities([])
      setShots([])
    }
  }, [isOpen])

  // Load options when type selected
  useEffect(() => {
    if (!targetType) return

    setLoading(true)

    if (targetType === 'entity') {
      getEntitiesForWorkspaceAction(projectId).then(data => {
        setEntities(data)
        setLoading(false)
      })
    } else {
      getShotsForWorkspaceAction(projectId).then(data => {
        setShots(data)
        setLoading(false)
      })
    }
  }, [targetType, projectId])

  // Handle selection
  const handleSelect = (targetId: string) => {
    if (!targetType) return

    startTransition(async () => {
      const result = await setBoardAsWorkspaceAction(boardId, projectId, targetType, targetId)
      if (result.success) {
        onSuccess()
        onClose()
      }
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-medium text-gray-900">
            Set as Workspace
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Link this board to an Entity or Shot
          </p>
        </div>

        {/* Content */}
        <div className="p-6">
          {!targetType ? (
            // Step 1: Choose type
            <div className="space-y-3">
              <button
                onClick={() => setTargetType('entity')}
                className="w-full p-4 text-left border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">👤</span>
                  <div>
                    <p className="font-medium text-gray-900">Entity</p>
                    <p className="text-sm text-gray-500">Character, Environment, or Asset</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setTargetType('shot')}
                className="w-full p-4 text-left border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🎬</span>
                  <div>
                    <p className="font-medium text-gray-900">Shot</p>
                    <p className="text-sm text-gray-500">From your Shotlist</p>
                  </div>
                </div>
              </button>
            </div>
          ) : (
            // Step 2: Select target
            <div>
              {/* Back button */}
              <button
                onClick={() => setTargetType(null)}
                className="text-sm text-gray-500 hover:text-gray-700 mb-4 flex items-center gap-1"
              >
                ← Back
              </button>

              {loading ? (
                <div className="py-8 text-center text-gray-500">
                  Loading...
                </div>
              ) : targetType === 'entity' ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {entities.length === 0 ? (
                    <p className="text-center text-gray-500 py-4">No entities in this project</p>
                  ) : (
                    entities.map(entity => (
                      <button
                        key={entity.id}
                        onClick={() => handleSelect(entity.id)}
                        disabled={isPending}
                        className={`
                          w-full p-3 text-left rounded-lg transition-colors
                          ${entity.has_workspace 
                            ? 'border border-gray-200 bg-gray-50 text-gray-400' 
                            : 'border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50'
                          }
                        `}
                      >
                        <div className="flex items-center gap-3">
                          <span>{TYPE_ICONS[entity.type] || '📋'}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{entity.name}</p>
                            <p className="text-xs text-gray-500 capitalize">{entity.type}</p>
                          </div>
                          {entity.has_workspace && (
                            <span className="text-xs text-gray-400">has workspace</span>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {shots.length === 0 ? (
                    <p className="text-center text-gray-500 py-4">No shots in this project</p>
                  ) : (
                    shots.map(shot => (
                      <button
                        key={shot.id}
                        onClick={() => handleSelect(shot.id)}
                        disabled={isPending}
                        className={`
                          w-full p-3 text-left rounded-lg transition-colors
                          ${shot.has_workspace 
                            ? 'border border-gray-200 bg-gray-50 text-gray-400' 
                            : 'border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50'
                          }
                        `}
                      >
                        <div className="flex items-center gap-3">
                          <span>🎬</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">
                              {shot.title.slice(0, 50) || 'Untitled'}
                              {shot.title.length > 50 && '...'}
                            </p>
                            <p className="text-xs text-gray-500">Shot #{shot.shot_number}</p>
                          </div>
                          {shot.has_workspace && (
                            <span className="text-xs text-gray-400">has workspace</span>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
