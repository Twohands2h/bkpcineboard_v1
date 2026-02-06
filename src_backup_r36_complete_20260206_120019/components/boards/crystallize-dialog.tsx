'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { 
  crystallizeAction, 
  setupWorkspaceAction,
  getSelectedNodesContentAction,
  type CrystallizeEntityType,
  type WorkspaceChoice,
  type SelectedNodeContent,
  type CreatedEntityRefNode
} from '@/app/actions/crystallize'

// ============================================
// TYPES
// ============================================

interface CrystallizeDialogProps {
  isOpen: boolean
  onClose: () => void
  boardId: string
  projectId: string
  selectedNodeIds: string[]
  isCurrentBoardWorkspace: boolean
  onSuccess: () => void
  onNodeCreated: (node: CreatedEntityRefNode) => void
  onNodesRemoved: (nodeIds: string[]) => void
  onWorkspaceSet?: () => void  // Chiamata quando Case A (board diventa workspace)
}

type DialogStep = 
  | 'type-name'
  | 'master-prompt'
  | 'creating'        // Durante Phase 1
  | 'workspace'       // Phase 2: scelta workspace
  | 'navigate'        // Solo Case B: vai o resta?
  | 'success'

// ============================================
// TYPE CONFIG
// ============================================

const TYPE_CONFIG: Record<CrystallizeEntityType, { icon: string; label: string; description: string }> = {
  character: { icon: '👤', label: 'Character', description: 'A person or creature' },
  environment: { icon: '🌍', label: 'Environment', description: 'A place or setting' },
  asset: { icon: '📦', label: 'Asset', description: 'An object or prop' },
}

// ============================================
// CRYSTALLIZE DIALOG v1
// ============================================

export function CrystallizeDialog({
  isOpen,
  onClose,
  boardId,
  projectId,
  selectedNodeIds,
  isCurrentBoardWorkspace,
  onSuccess,
  onNodeCreated,
  onNodesRemoved,
  onWorkspaceSet,
}: CrystallizeDialogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  
  // Dialog state
  const [step, setStep] = useState<DialogStep>('type-name')
  const [error, setError] = useState<string | null>(null)
  
  // Step 1: Type + Name
  const [entityType, setEntityType] = useState<CrystallizeEntityType | null>(null)
  const [name, setName] = useState('')
  
  // Node content (loaded on open)
  const [nodeContent, setNodeContent] = useState<SelectedNodeContent | null>(null)
  const [isLoadingContent, setIsLoadingContent] = useState(false)
  
  // Step 2: Master Prompt selection
  const [masterPromptIndex, setMasterPromptIndex] = useState<number>(0)
  
  // Phase 1 result (stored for Phase 2)
  const [createdEntityId, setCreatedEntityId] = useState<string | null>(null)
  
  // Phase 2 result
  const [workspaceUrl, setWorkspaceUrl] = useState<string | null>(null)

  // Load node content when dialog opens
  useEffect(() => {
    if (isOpen && selectedNodeIds.length > 0) {
      setIsLoadingContent(true)
      getSelectedNodesContentAction(selectedNodeIds)
        .then(content => {
          setNodeContent(content)
          setIsLoadingContent(false)
        })
        .catch(err => {
          console.error('Failed to load node content:', err)
          setError('Failed to load selected nodes')
          setIsLoadingContent(false)
        })
    }
  }, [isOpen, selectedNodeIds])

  // Reset on close
  const handleClose = () => {
    setStep('type-name')
    setEntityType(null)
    setName('')
    setMasterPromptIndex(0)
    setCreatedEntityId(null)
    setWorkspaceUrl(null)
    setError(null)
    setNodeContent(null)
    onClose()
  }

  // Step 1 → Step 2 or execute
  const handleTypeNameNext = () => {
    if (!entityType || !name.trim()) return
    
    if (nodeContent && nodeContent.prompts.length > 1) {
      setStep('master-prompt')
    } else {
      executeCrystallize()
    }
  }

  // Step 2 → execute
  const handleMasterPromptNext = () => {
    executeCrystallize()
  }

  // ============================================
  // PHASE 1: Create Entity + EntityRefNode (ATOMICA)
  // ============================================
  const executeCrystallize = () => {
    if (!entityType || !name.trim()) return

    setError(null)
    setStep('creating')
    
    startTransition(async () => {
      const result = await crystallizeAction({
        sourceBoardId: boardId,
        projectId,
        entityType,
        name: name.trim(),
        selectedNodeIds,
        masterPromptIndex: nodeContent && nodeContent.prompts.length > 1 ? masterPromptIndex : 0,
      })

      if (result.success && result.result) {
        // 1. Rimuovi nodi dal canvas locale
        onNodesRemoved(result.result.archivedNodeIds)
        
        // 2. Aggiungi EntityRefNode al canvas locale
        onNodeCreated(result.result.entityRefNode)
        
        // 3. Clear selection
        onSuccess()
        
        // 4. Salva entityId per Phase 2
        setCreatedEntityId(result.result.entityId)
        
        // 5. Vai a workspace choice
        setStep('workspace')
      } else {
        setError(result.error || 'Failed to create entity')
        setStep('type-name')
      }
    })
  }

  // ============================================
  // PHASE 2: Setup Workspace
  // ============================================
  const handleWorkspaceChoice = (choice: WorkspaceChoice) => {
    if (!createdEntityId || !entityType) return

    setError(null)
    
    startTransition(async () => {
      const result = await setupWorkspaceAction({
        sourceBoardId: boardId,
        projectId,
        entityId: createdEntityId,
        entityName: name.trim(),
        entityType,
        workspaceChoice: choice,
      })

      if (result.success && result.result) {
        if (choice === 'create-new') {
          setWorkspaceUrl(result.result.workspaceUrl)
          setStep('navigate')
        } else if (choice === 'use-current') {
          // Case A: board è diventata workspace, aggiorna UI
          onWorkspaceSet?.()
          setStep('success')
          setTimeout(handleClose, 1200)
        } else {
          // no-workspace: chiudi
          setStep('success')
          setTimeout(handleClose, 1200)
        }
      } else {
        setError(result.error || 'Failed to setup workspace')
      }
    })
  }

  // Navigate to new workspace
  const handleNavigateToWorkspace = () => {
    if (workspaceUrl) {
      handleClose()
      router.push(workspaceUrl)
    }
  }

  // Stay on current board
  const handleStayHere = () => {
    setStep('success')
    setTimeout(handleClose, 1200)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />

      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        
        {/* ============================================ */}
        {/* STEP: TYPE + NAME */}
        {/* ============================================ */}
        {step === 'type-name' && (
          <>
            <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-purple-50">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <span>✨</span> Crystallize
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Create Entity from {selectedNodeIds.length} selected node{selectedNodeIds.length > 1 ? 's' : ''}
              </p>
            </div>

            <div className="p-6 space-y-6">
              {isLoadingContent ? (
                <div className="text-center py-4 text-gray-500">Loading...</div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      What are you creating?
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {(Object.entries(TYPE_CONFIG) as [CrystallizeEntityType, typeof TYPE_CONFIG[CrystallizeEntityType]][]).map(([type, config]) => (
                        <button
                          key={type}
                          onClick={() => setEntityType(type)}
                          className={`p-3 text-center rounded-lg border-2 transition-all ${
                            entityType === type 
                              ? 'border-indigo-500 bg-indigo-50' 
                              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <span className="text-2xl block mb-1">{config.icon}</span>
                          <p className={`text-sm font-medium ${entityType === type ? 'text-indigo-700' : 'text-gray-900'}`}>
                            {config.label}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={entityType ? `Enter ${TYPE_CONFIG[entityType].label.toLowerCase()} name...` : 'Enter name...'}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && entityType && name.trim()) handleTypeNameNext()
                      }}
                    />
                  </div>

                  {nodeContent && (
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
                      <p className="font-medium text-gray-700 mb-1">Selected content:</p>
                      <ul className="space-y-0.5">
                        {nodeContent.images.length > 0 && (
                          <li>📷 {nodeContent.images.length} image{nodeContent.images.length > 1 ? 's' : ''}</li>
                        )}
                        {nodeContent.prompts.length > 0 && (
                          <li>✨ {nodeContent.prompts.length} prompt{nodeContent.prompts.length > 1 ? 's' : ''}</li>
                        )}
                        {nodeContent.notes.length > 0 && (
                          <li>📝 {nodeContent.notes.length} note{nodeContent.notes.length > 1 ? 's' : ''}</li>
                        )}
                      </ul>
                    </div>
                  )}

                  {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>
                  )}
                </>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
              <button onClick={handleClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                Cancel
              </button>
              <button
                onClick={handleTypeNameNext}
                disabled={!entityType || !name.trim() || isLoadingContent}
                className={`px-5 py-2 text-sm font-medium rounded-lg transition-all ${
                  entityType && name.trim() && !isLoadingContent
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                {nodeContent && nodeContent.prompts.length > 1 ? 'Next →' : 'Create Entity ✨'}
              </button>
            </div>
          </>
        )}

        {/* ============================================ */}
        {/* STEP: MASTER PROMPT SELECTION */}
        {/* ============================================ */}
        {step === 'master-prompt' && nodeContent && (
          <>
            <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-amber-50 to-orange-50">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <span>✨</span> Choose Master Prompt
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Which prompt should be the master?
              </p>
            </div>

            <div className="p-6 space-y-3 max-h-80 overflow-y-auto">
              {nodeContent.prompts.map((prompt, index) => (
                <button
                  key={index}
                  onClick={() => setMasterPromptIndex(index)}
                  className={`w-full p-4 text-left rounded-lg border-2 transition-all ${
                    masterPromptIndex === index 
                      ? 'border-amber-500 bg-amber-50' 
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      masterPromptIndex === index ? 'border-amber-500 bg-amber-500' : 'border-gray-300'
                    }`}>
                      {masterPromptIndex === index && (
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 mb-1">{prompt.title || `Prompt ${index + 1}`}</p>
                      <p className="text-sm text-gray-600 line-clamp-2">{prompt.body || 'Empty'}</p>
                    </div>
                  </div>
                </button>
              ))}
              <p className="text-xs text-gray-500 italic">Other prompts will be saved as notes.</p>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
              <button onClick={() => setStep('type-name')} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                ← Back
              </button>
              <button
                onClick={handleMasterPromptNext}
                className="px-5 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Create Entity ✨
              </button>
            </div>
          </>
        )}

        {/* ============================================ */}
        {/* STEP: CREATING (Loading) */}
        {/* ============================================ */}
        {step === 'creating' && (
          <div className="p-8 text-center">
            <div className="text-4xl mb-4 animate-pulse">✨</div>
            <p className="text-gray-600">Creating {name}...</p>
          </div>
        )}

        {/* ============================================ */}
        {/* STEP: WORKSPACE CHOICE */}
        {/* ============================================ */}
        {step === 'workspace' && (
          <>
            <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-teal-50">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <span>✅</span> {name} Created!
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Set up a workspace for this entity?
              </p>
            </div>

            <div className="p-6 space-y-3">
              {!isCurrentBoardWorkspace && (
                <button
                  onClick={() => handleWorkspaceChoice('use-current')}
                  disabled={isPending}
                  className="w-full p-4 text-left rounded-lg border-2 border-gray-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all"
                >
                  <p className="font-medium text-gray-900">Use this board as workspace</p>
                  <p className="text-sm text-gray-500 mt-1">This board becomes the workspace for {name}.</p>
                </button>
              )}

              <button
                onClick={() => handleWorkspaceChoice('create-new')}
                disabled={isPending}
                className="w-full p-4 text-left rounded-lg border-2 border-gray-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all"
              >
                <p className="font-medium text-gray-900">Create a new workspace</p>
                <p className="text-sm text-gray-500 mt-1">A new board will be created as workspace.</p>
              </button>

              <button
                onClick={() => handleWorkspaceChoice('no-workspace')}
                disabled={isPending}
                className="w-full p-4 text-left rounded-lg border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all"
              >
                <p className="font-medium text-gray-700">Don't create a workspace</p>
                <p className="text-sm text-gray-500 mt-1">Just the entity. Add a workspace later.</p>
              </button>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>
              )}
            </div>
          </>
        )}

        {/* ============================================ */}
        {/* STEP: NAVIGATE */}
        {/* ============================================ */}
        {step === 'navigate' && (
          <>
            <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-purple-50">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <span>🏠</span> Workspace Created!
              </h2>
            </div>

            <div className="p-6 space-y-3">
              <button
                onClick={handleNavigateToWorkspace}
                className="w-full p-4 text-left rounded-lg border-2 border-indigo-500 bg-indigo-50 hover:bg-indigo-100 transition-colors"
              >
                <p className="font-medium text-indigo-700">Go to {name} Workspace →</p>
                <p className="text-sm text-indigo-600 mt-1">Start working on your {entityType}.</p>
              </button>

              <button
                onClick={handleStayHere}
                className="w-full p-4 text-left rounded-lg border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors"
              >
                <p className="font-medium text-gray-700">Stay on this board</p>
                <p className="text-sm text-gray-500 mt-1">Continue working here.</p>
              </button>
            </div>
          </>
        )}

        {/* ============================================ */}
        {/* STEP: SUCCESS */}
        {/* ============================================ */}
        {step === 'success' && (
          <div className="p-8 text-center">
            <div className="text-5xl mb-4">✨</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Done!</h2>
            <p className="text-gray-600">{name} is ready.</p>
          </div>
        )}

      </div>
    </div>
  )
}
