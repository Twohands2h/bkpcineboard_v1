'use server'

import { revalidatePath } from 'next/cache'
import {
  createNode,
  updateNode,
  deleteNode,
  duplicateNode,
  type BoardNode,
  type BaseNodeContent,
  type NodeArchetype,
  type NodeVariant
} from '@/lib/db/mutations/nodes'

// Re-export types
export type { BoardNode, BaseNodeContent, NodeArchetype, NodeVariant }

// ============================================
// ACTION: createNodeAction
// ============================================

export async function createNodeAction(
  boardId: string,
  archetype: NodeArchetype,
  variant: NodeVariant,
  position: { x: number; y: number },
  content?: Partial<BaseNodeContent>
): Promise<BoardNode> {
  const node = await createNode(boardId, archetype, variant, position, content)
  // Revalidate board page to reflect new node on navigation
  revalidatePath(`/projects/[id]/boards/${boardId}`, 'page')
  return node
}

// ============================================
// ACTION: updateNodeAction
// ============================================

interface UpdateNodeParams {
  content?: Partial<BaseNodeContent>
  position?: { x: number; y: number }
  size?: { width: number; height: number }
}

export async function updateNodeAction(
  nodeId: string,
  updates: UpdateNodeParams
): Promise<BoardNode> {
  const node = await updateNode(nodeId, updates)
  // Revalidate board page to reflect updates on navigation
  revalidatePath(`/projects/[id]/boards/${node.board_id}`, 'page')
  return node
}

// ============================================
// ACTION: deleteNodeAction
// ============================================

export async function deleteNodeAction(nodeId: string): Promise<BoardNode> {
  const node = await deleteNode(nodeId)
  // Revalidate board page to reflect deletion on navigation
  revalidatePath(`/projects/[id]/boards/${node.board_id}`, 'page')
  return node
}

// ============================================
// ACTION: duplicateNodeAction
// ============================================

export async function duplicateNodeAction(nodeId: string): Promise<BoardNode> {
  const node = await duplicateNode(nodeId)
  // Revalidate board page to reflect new node on navigation
  revalidatePath(`/projects/[id]/boards/${node.board_id}`, 'page')
  return node
}
