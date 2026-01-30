import { notFound } from 'next/navigation'
import { getBoard, getBoardNodes } from '@/lib/db/queries/boards'
import { getBoardWorkspaceLink } from '@/lib/db/queries/board-links'
import { getWorkspaceTarget } from '@/lib/db/queries/workspace-context'
import { BoardDetailClient } from './board-detail-client'

// ============================================
// TYPES
// ============================================

interface PageProps {
  params: Promise<{ id: string; boardId: string }>
}

// ============================================
// PAGE COMPONENT
// ============================================

export default async function BoardDetailPage({ params }: PageProps) {
  const { id: projectId, boardId } = await params

  // Fetch board
  const board = await getBoard(boardId)
  if (!board) {
    notFound()
  }

  // Fetch nodes
  const nodes = await getBoardNodes(boardId)

  // Fetch workspace info (for badge display)
  const workspaceInfo = await getBoardWorkspaceLink(boardId)

  // Fetch workspace target with canonical content (Phase 2J)
  const workspaceTarget = await getWorkspaceTarget(boardId)

  // Parse canvas state for viewport
  const canvasState = board.canvas_state as { x?: number; y?: number; zoom?: number } | null
  const initialViewport = canvasState ? {
    x: canvasState.x ?? 0,
    y: canvasState.y ?? 0,
    zoom: canvasState.zoom ?? 1
  } : undefined

  return (
    <BoardDetailClient
      projectId={projectId}
      boardId={boardId}
      boardTitle={board.title}
      boardDescription={board.description}
      initialViewport={initialViewport}
      initialNodes={nodes}
      initialWorkspaceInfo={workspaceInfo}
      initialWorkspaceTarget={workspaceTarget}
    />
  )
}
