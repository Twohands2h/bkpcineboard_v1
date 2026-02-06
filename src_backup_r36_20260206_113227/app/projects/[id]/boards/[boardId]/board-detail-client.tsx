'use client'

import { useState, useTransition, useCallback } from 'react'
import Link from 'next/link'
import { BoardCanvas, type WorkspaceInfo, type PendingEntityDrop } from '@/components/boards/board-canvas'
import { NodePalette } from '@/components/boards/node-palette'
import { BoardStatusBadge } from '@/components/boards/board-status-badge'
import { SetWorkspaceDialog } from '@/components/boards/set-workspace-dialog'
import { CrystallizeButton } from '@/components/boards/crystallize-button'
import { CrystallizeDialog } from '@/components/boards/crystallize-dialog'
import { EntitySelectorDialog } from '@/components/boards/entity-selector-dialog'
import { useClipboard } from '@/contexts/clipboard-context'
import { createNodeAction } from '@/app/actions/nodes'
import { 
  getBoardWorkspaceInfoAction, 
  unsetBoardWorkspaceAction,
  type BoardWorkspaceInfo 
} from '@/app/actions/board-links'
import type { WorkspaceTarget } from '@/lib/db/queries/workspace-context'
import type { EntitySummary } from '@/app/actions/entity-selector'
import type { CreatedEntityRefNode } from '@/app/actions/crystallize'

// ============================================
// TYPES
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BoardNodeData = any

interface BoardDetailClientProps {
  projectId: string
  boardId: string
  boardTitle: string
  boardDescription: string | null
  initialViewport?: {
    x: number
    y: number
    zoom: number
  }
  initialNodes: BoardNodeData[]
  initialWorkspaceInfo: BoardWorkspaceInfo | null
  initialWorkspaceTarget: WorkspaceTarget | null
}

// ============================================
// BOARD DETAIL CLIENT
// ============================================

export function BoardDetailClient({
  projectId,
  boardId,
  boardTitle,
  boardDescription,
  initialViewport,
  initialNodes,
  initialWorkspaceInfo,
  initialWorkspaceTarget
}: BoardDetailClientProps) {
  const { clearClipboard, hasClipboard } = useClipboard()
  const [isPending, startTransition] = useTransition()
  
  // Workspace state
  const [workspaceInfo, setWorkspaceInfo] = useState<BoardWorkspaceInfo | null>(initialWorkspaceInfo)
  const [workspaceTarget, setWorkspaceTarget] = useState<WorkspaceTarget | null>(initialWorkspaceTarget)
  const [showWorkspaceDialog, setShowWorkspaceDialog] = useState(false)

  // Crystallize state
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const [showCrystallizeDialog, setShowCrystallizeDialog] = useState(false)

  // Phase 2K: Entity selector state
  const [pendingEntityDrop, setPendingEntityDrop] = useState<PendingEntityDrop | null>(null)
  
  // Canvas manipulation callbacks
  const [addNodeCallback, setAddNodeCallback] = useState<((node: BoardNodeData) => void) | null>(null)
  const [removeNodesCallback, setRemoveNodesCallback] = useState<((nodeIds: string[]) => void) | null>(null)

  // Refresh workspace info
  const refreshWorkspaceInfo = useCallback(() => {
    getBoardWorkspaceInfoAction(boardId).then(setWorkspaceInfo)
  }, [boardId])

  // Handle unset workspace
  const handleUnsetWorkspace = () => {
    startTransition(async () => {
      const result = await unsetBoardWorkspaceAction(boardId, projectId)
      if (result.success) {
        setWorkspaceInfo(null)
        setWorkspaceTarget(null)
      }
    })
  }

  // Handle selection change from canvas
  const handleSelectionChange = useCallback((ids: string[]) => {
    setSelectedNodeIds(ids)
  }, [])

  // Clear selection after crystallize
  const handleCrystallizeSuccess = useCallback(() => {
    setSelectedNodeIds([])
  }, [])

  // Register canvas callback for adding nodes
  const handleNodeAddedCallback = useCallback((callback: (node: BoardNodeData) => void) => {
    setAddNodeCallback(() => callback)
  }, [])

  // Register canvas callback for removing nodes
  const handleNodesRemovedCallback = useCallback((callback: (nodeIds: string[]) => void) => {
    setRemoveNodesCallback(() => callback)
  }, [])

  // Crystallize: add EntityRefNode to canvas
  const handleCrystallizeNodeCreated = useCallback((node: CreatedEntityRefNode) => {
    if (addNodeCallback) {
      addNodeCallback(node as BoardNodeData)
    }
  }, [addNodeCallback])

  // Crystallize: remove archived nodes from canvas
  const handleCrystallizeNodesRemoved = useCallback((nodeIds: string[]) => {
    if (removeNodesCallback) {
      removeNodesCallback(nodeIds)
    }
  }, [removeNodesCallback])

  // Handle entity drop from palette
  const handleEntityDrop = useCallback((drop: PendingEntityDrop) => {
    setPendingEntityDrop(drop)
  }, [])

  // Handle entity selected from dialog
  const handleEntitySelected = useCallback(async (entity: EntitySummary) => {
    if (!pendingEntityDrop) return
    
    try {
      const content = {
        variant: 'entity',
        ref_type: 'entity',
        ref_id: entity.id,
        entity_type: pendingEntityDrop.entityType,
        display_title: entity.name,
        display_image: entity.reference_images?.[0] || null,
        ui: { collapsed: false }
      }
      
      const newNode = await createNodeAction(
        boardId,
        'reference',
        'entity',
        pendingEntityDrop.position,
        content
      )
      
      if (addNodeCallback) {
        addNodeCallback(newNode)
      }
      
    } catch (error) {
      console.error('Failed to create EntityRef node:', error)
    }
    
    setPendingEntityDrop(null)
  }, [pendingEntityDrop, boardId, addNodeCallback])

  // Build workspaceInfo for BoardCanvas
  const canvasWorkspaceInfo: WorkspaceInfo | undefined = workspaceTarget ? {
    isWorkspace: true,
    targetType: workspaceTarget.type,
    targetId: workspaceTarget.id,
    targetName: workspaceTarget.name,
    projectId,
    canonicalMasterPrompt: workspaceTarget.type === 'entity' 
      ? workspaceTarget.masterPrompt 
      : null,
    canonicalReferenceImages: workspaceTarget.type === 'entity' 
      ? workspaceTarget.referenceImages 
      : null,
    canonicalShotDescription: workspaceTarget.type === 'shot' 
      ? workspaceTarget.description 
      : null,
  } : undefined

  // Is current board already a workspace?
  const isCurrentBoardWorkspace = !!workspaceInfo

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="flex-none bg-white border-b border-gray-200">
        <div className="px-4 py-3 flex items-center justify-between">
          {/* Left: Back + Title */}
          <div className="flex items-center gap-4">
            <Link
              href={`/projects/${projectId}/boards`}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              ← Boards
            </Link>
            <span className="text-gray-300">|</span>
            <h1 className="text-lg font-medium text-gray-900">
              {boardTitle}
            </h1>
          </div>

          {/* Center: Board Status */}
          <div className="flex items-center gap-3">
            <BoardStatusBadge workspaceInfo={workspaceInfo} />
            
            {/* Action button */}
            {workspaceInfo ? (
              <button
                onClick={handleUnsetWorkspace}
                disabled={isPending}
                className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Unset Workspace
              </button>
            ) : (
              <button
                onClick={() => setShowWorkspaceDialog(true)}
                className="px-3 py-1.5 text-sm text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors font-medium"
              >
                Set as Workspace
              </button>
            )}
          </div>
          
          {/* Right: Clipboard indicator */}
          <div className="flex items-center gap-4">
            {hasClipboard && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-full">
                <span className="text-xs text-blue-600 font-medium">
                  1 node copied
                </span>
                <button
                  onClick={clearClipboard}
                  className="text-blue-400 hover:text-blue-600 text-xs"
                  title="Clear clipboard"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main: Palette + Canvas */}
      <div className="flex-1 flex overflow-hidden">
        <NodePalette boardId={boardId} />

        <main className="flex-1 relative">
          <div className="absolute inset-0">
            <BoardCanvas
              boardId={boardId}
              projectId={projectId}
              initialViewport={initialViewport}
              initialNodes={initialNodes}
              onSelectionChange={handleSelectionChange}
              onEntityDrop={handleEntityDrop}
              onNodeAdded={handleNodeAddedCallback}
              onNodesRemoved={handleNodesRemovedCallback}
              workspaceInfo={canvasWorkspaceInfo}
            />
          </div>
          
          {/* Clipboard hint */}
          {hasClipboard && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none">
              <div className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg shadow-lg">
                Click anywhere to paste • ⌘V to paste at center
              </div>
            </div>
          )}

          {/* Crystallize floating button */}
          {selectedNodeIds.length > 0 && (
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2">
              <CrystallizeButton
                selectedCount={selectedNodeIds.length}
                onClick={() => setShowCrystallizeDialog(true)}
              />
            </div>
          )}
        </main>
      </div>

      {/* Set Workspace Dialog */}
      <SetWorkspaceDialog
        isOpen={showWorkspaceDialog}
        onClose={() => setShowWorkspaceDialog(false)}
        boardId={boardId}
        projectId={projectId}
        onSuccess={refreshWorkspaceInfo}
      />

      {/* Crystallize Dialog */}
      <CrystallizeDialog
        isOpen={showCrystallizeDialog}
        onClose={() => setShowCrystallizeDialog(false)}
        boardId={boardId}
        projectId={projectId}
        selectedNodeIds={selectedNodeIds}
        isCurrentBoardWorkspace={isCurrentBoardWorkspace}
        onSuccess={handleCrystallizeSuccess}
        onNodeCreated={handleCrystallizeNodeCreated}
        onNodesRemoved={handleCrystallizeNodesRemoved}
        onWorkspaceSet={refreshWorkspaceInfo}
      />

      {/* Entity Selector Dialog */}
      {pendingEntityDrop && (
        <EntitySelectorDialog
          isOpen={true}
          onClose={() => setPendingEntityDrop(null)}
          projectId={projectId}
          entityType={pendingEntityDrop.entityType}
          onSelect={handleEntitySelected}
        />
      )}
    </div>
  )
}
