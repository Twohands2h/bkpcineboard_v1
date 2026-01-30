'use server'

import { revalidatePath } from 'next/cache'
import { createBoard, archiveBoard } from '@/lib/db/mutations/boards'
import { updateCanvasState } from '@/lib/db/mutations/canvas'
import { getBoardWorkspaceLink } from '@/lib/db/queries/board-links'
import { unsetBoardWorkspace } from '@/lib/db/mutations/board-links'

/**
 * Server Action: Create a new board
 * 
 * @param projectId - UUID del progetto
 * @param formData - FormData con title e description
 * @returns { id: string } - ID della board creata
 */
export async function createBoardAction(
  projectId: string,
  formData: FormData
): Promise<{ id: string }> {
  const title = formData.get('title') as string
  const description = formData.get('description') as string | null

  if (!title || title.trim() === '') {
    throw new Error('Title is required')
  }

  const board = await createBoard(
    projectId,
    title.trim(),
    description?.trim() || undefined
  )

  revalidatePath(`/projects/${projectId}/boards`)

  return { id: board.id }
}

/**
 * Server Action: Update canvas viewport state
 * 
 * Persistenza tecnica - fire and forget.
 * Non critico se fallisce.
 * 
 * @param boardId - UUID della board
 * @param viewport - Stato viewport { x, y, zoom }
 */
export async function updateCanvasStateAction(
  boardId: string,
  viewport: { x: number; y: number; zoom: number }
): Promise<void> {
  await updateCanvasState(boardId, viewport)
  // No revalidatePath - non serve refresh UI
}

/**
 * Server Action: Delete (archive) a board
 * 
 * If board is a workspace, automatically ends the workspace link first
 * using the canonical unsetBoardWorkspace mutation.
 * Soft delete - imposta status = 'archived'
 * 
 * @param boardId - UUID della board
 * @param projectId - UUID del progetto (per revalidation)
 * @returns { success: boolean }
 */
export async function deleteBoardAction(
  boardId: string,
  projectId: string
): Promise<{ success: boolean }> {
  // Check if board is a workspace
  const workspaceLink = await getBoardWorkspaceLink(boardId)
  
  // If it's a workspace, end the link first
  if (workspaceLink) {
    await unsetBoardWorkspace(boardId)
  }
  
  // Now archive the board
  await archiveBoard(boardId)
  
  revalidatePath(`/projects/${projectId}/boards`)
  
  return { success: true }
}
