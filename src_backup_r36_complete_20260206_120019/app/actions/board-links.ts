'use server'

import { revalidatePath } from 'next/cache'
import { setBoardAsWorkspace, unsetBoardWorkspace } from '@/lib/db/mutations/board-links'
import { 
  getBoardWorkspaceLink, 
  getEntitiesForWorkspace, 
  getShotsForWorkspace,
  type BoardWorkspaceInfo 
} from '@/lib/db/queries/board-links'

// Re-export types
export type { BoardWorkspaceInfo }

// ============================================
// ACTION: Get Board Workspace Info
// ============================================

export async function getBoardWorkspaceInfoAction(
  boardId: string
): Promise<BoardWorkspaceInfo | null> {
  return await getBoardWorkspaceLink(boardId)
}

// ============================================
// ACTION: Get Entities for Workspace Selector
// ============================================

export async function getEntitiesForWorkspaceAction(
  projectId: string
): Promise<Array<{ id: string; name: string; type: string; has_workspace: boolean }>> {
  return await getEntitiesForWorkspace(projectId)
}

// ============================================
// ACTION: Get Shots for Workspace Selector
// ============================================

export async function getShotsForWorkspaceAction(
  projectId: string
): Promise<Array<{ id: string; title: string; shot_number: string; has_workspace: boolean }>> {
  return await getShotsForWorkspace(projectId)
}

// ============================================
// ACTION: Set Board as Workspace
// ============================================

export async function setBoardAsWorkspaceAction(
  boardId: string,
  projectId: string,
  targetType: 'entity' | 'shot',
  targetId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await setBoardAsWorkspace(boardId, targetType, targetId)
    revalidatePath(`/projects/${projectId}/boards/${boardId}`)
    return { success: true }
  } catch (error) {
    console.error('Failed to set workspace:', error)
    return { success: false, error: String(error) }
  }
}

// ============================================
// ACTION: Unset Board Workspace
// ============================================

export async function unsetBoardWorkspaceAction(
  boardId: string,
  projectId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await unsetBoardWorkspace(boardId)
    revalidatePath(`/projects/${projectId}/boards/${boardId}`)
    return { success: true }
  } catch (error) {
    console.error('Failed to unset workspace:', error)
    return { success: false, error: String(error) }
  }
}

