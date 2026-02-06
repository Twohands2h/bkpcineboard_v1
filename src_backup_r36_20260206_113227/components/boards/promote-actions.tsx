'use client'

import { useState, useCallback } from 'react'
import { 
  promoteToMasterPromptAction,
  promoteToReferenceImagesAction,
  promoteToShotDescriptionAction
} from '@/app/actions/promote-canonical'
import type { WorkspaceInfo } from '@/components/boards/board-canvas'

// ============================================
// TYPES
// ============================================

interface PromoteActionsProps {
  nodeVariant: string
  nodeContent: {
    body?: string
    items?: Array<{ url: string; source?: string; caption?: string }>
  }
  workspaceInfo?: WorkspaceInfo  // Phase 2J: passed from node data
  onSuccess?: () => void
}

// ============================================
// COMPONENT
// ============================================

/**
 * PromoteActions - Pulsanti per promuovere contenuto a canonico
 */
export function PromoteActions({ 
  nodeVariant, 
  nodeContent,
  workspaceInfo,
  onSuccess
}: PromoteActionsProps) {
  const [isPromoting, setIsPromoting] = useState(false)
  
  const canPromoteToMasterPrompt = 
    workspaceInfo?.isWorkspace && 
    workspaceInfo?.targetType === 'entity' && 
    nodeVariant === 'prompt' &&
    !!nodeContent.body?.trim()
  
  const canPromoteToReferenceImages = 
    workspaceInfo?.isWorkspace && 
    workspaceInfo?.targetType === 'entity' && 
    nodeVariant === 'image' &&
    !!nodeContent.items?.[0]?.url
  
  const canPromoteToShotDescription = 
    workspaceInfo?.isWorkspace && 
    workspaceInfo?.targetType === 'shot' && 
    (nodeVariant === 'prompt' || nodeVariant === 'note') &&
    !!nodeContent.body?.trim()
  
  if (!canPromoteToMasterPrompt && !canPromoteToReferenceImages && !canPromoteToShotDescription) {
    return (
      <div className="px-3 py-2 text-xs text-gray-400 italic">
        No actions available
      </div>
    )
  }
  
  const handlePromoteToMasterPrompt = useCallback(async () => {
    if (!workspaceInfo?.targetId || !nodeContent.body) return
    
    setIsPromoting(true)
    try {
      const result = await promoteToMasterPromptAction(
        workspaceInfo.targetId,
        workspaceInfo.projectId,
        nodeContent.body
      )
      
      if (result.success) {
        onSuccess?.()
      } else {
        console.error('Failed to promote:', result.error)
      }
    } catch (error) {
      console.error('Failed to promote:', error)
    } finally {
      setIsPromoting(false)
    }
  }, [workspaceInfo?.targetId, workspaceInfo?.projectId, nodeContent.body, onSuccess])
  
  const handlePromoteToReferenceImages = useCallback(async () => {
    if (!workspaceInfo?.targetId) return
    
    const imageUrl = nodeContent.items?.[0]?.url
    if (!imageUrl) return
    
    setIsPromoting(true)
    try {
      const result = await promoteToReferenceImagesAction(
        workspaceInfo.targetId,
        workspaceInfo.projectId,
        imageUrl,
        'append'
      )
      
      if (result.success) {
        onSuccess?.()
      } else {
        console.error('Failed to promote:', result.error)
      }
    } catch (error) {
      console.error('Failed to promote:', error)
    } finally {
      setIsPromoting(false)
    }
  }, [workspaceInfo?.targetId, workspaceInfo?.projectId, nodeContent.items, onSuccess])
  
  const handlePromoteToShotDescription = useCallback(async () => {
    if (!workspaceInfo?.targetId || !nodeContent.body) return
    
    setIsPromoting(true)
    try {
      const result = await promoteToShotDescriptionAction(
        workspaceInfo.targetId,
        workspaceInfo.projectId,
        nodeContent.body
      )
      
      if (result.success) {
        onSuccess?.()
      } else {
        console.error('Failed to promote:', result.error)
      }
    } catch (error) {
      console.error('Failed to promote:', error)
    } finally {
      setIsPromoting(false)
    }
  }, [workspaceInfo?.targetId, workspaceInfo?.projectId, nodeContent.body, onSuccess])
  
  return (
    <div className="py-1">
      <div className="px-3 py-1 text-[10px] text-gray-400 uppercase tracking-wide">
        Promote to {workspaceInfo?.targetName}
      </div>
      
      {canPromoteToMasterPrompt && (
        <button
          onClick={handlePromoteToMasterPrompt}
          disabled={isPromoting}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-600 hover:bg-amber-50 hover:text-amber-700 transition-colors disabled:opacity-50"
        >
          <span className="text-amber-500">♕</span>
          Set as Master Prompt
        </button>
      )}
      
      {canPromoteToReferenceImages && (
        <button
          onClick={handlePromoteToReferenceImages}
          disabled={isPromoting}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-600 hover:bg-blue-50 hover:text-blue-700 transition-colors disabled:opacity-50"
        >
          <span className="text-blue-500">◈</span>
          Add to Reference Images
        </button>
      )}
      
      {canPromoteToShotDescription && (
        <button
          onClick={handlePromoteToShotDescription}
          disabled={isPromoting}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors disabled:opacity-50"
        >
          <span className="text-emerald-500">✎</span>
          Set as Shot Description
        </button>
      )}
    </div>
  )
}
