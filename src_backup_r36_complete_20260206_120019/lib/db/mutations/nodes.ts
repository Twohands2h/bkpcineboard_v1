import { createClient } from '@/lib/supabase/server'

// ============================================
// TYPES
// ============================================

export interface NodeContentUI {
  color?: string
  collapsed?: boolean
}

export interface BaseNodeContent {
  variant?: string
  title?: string
  ui?: NodeContentUI
  [key: string]: unknown
}

export interface BoardNode {
  id: string
  board_id: string
  node_type: NodeArchetype
  position_x: number
  position_y: number
  width: number
  height: number
  content: BaseNodeContent
  parent_id: string | null
  status: 'active' | 'removed'
  version: number
  superseded_by: string | null
  previous_version: string | null
  content_updated_at: string | null
  created_at: string
  updated_at: string
}

// ============================================
// ARCHETIPI & VARIANTS
// ============================================

const VALID_ARCHETYPES = ['content', 'structural', 'reference'] as const
export type NodeArchetype = typeof VALID_ARCHETYPES[number]

export type NodeVariant = 'note' | 'prompt' | 'image' | 'entity' | 'group' | string

// ============================================
// CONSTANTS
// ============================================

const DEFAULT_WIDTH = 220
const DEFAULT_HEIGHT = 140
const DEFAULT_IMAGE_HEIGHT = 180

// ============================================
// DEFAULT CONTENT PER VARIANT
// ============================================

function getDefaultContent(variant: NodeVariant): BaseNodeContent {
  switch (variant) {
    case 'note':
      return {
        variant: 'note',
        title: '',
        body: '',
        ui: { collapsed: false }
      }
    case 'prompt':
      return {
        variant: 'prompt',
        title: '',
        body: '',
        platform: undefined,
        model: undefined,
        ui: { collapsed: false }
      }
    case 'image':
      return {
        variant: 'image',
        title: '',
        items: [],
        ui: { collapsed: false }
      }
    case 'entity':
      return {
        variant: 'entity',
        ref_type: 'entity',
        ref_id: '',
        display_title: '',
        ui: { collapsed: false }
      }
    case 'group':
      return {
        variant: 'group',
        title: '',
        ui: { collapsed: false }
      }
    default:
      return {
        variant: variant,
        title: '',
        ui: { collapsed: false }
      }
  }
}

function getDefaultHeight(variant: NodeVariant): number {
  switch (variant) {
    case 'image':
      return DEFAULT_IMAGE_HEIGHT
    case 'group':
      return 200
    default:
      return DEFAULT_HEIGHT
  }
}

// ============================================
// MUTATION: createNode
// ============================================

/**
 * Crea un nuovo nodo su una board
 * 
 * @param boardId - UUID della board
 * @param archetype - Archetipo: 'content' | 'structural' | 'reference'
 * @param variant - Tipo concreto: 'note' | 'prompt' | 'image' | 'entity' | 'group'
 * @param position - Posizione { x, y }
 * @param content - Contenuto iniziale opzionale (merge con defaults)
 */
export async function createNode(
  boardId: string,
  archetype: NodeArchetype,
  variant: NodeVariant,
  position: { x: number; y: number },
  content?: Partial<BaseNodeContent>
): Promise<BoardNode> {
  const supabase = await createClient()

  if (!VALID_ARCHETYPES.includes(archetype)) {
    throw new Error(`Invalid archetype: ${archetype}`)
  }

  const defaultContent = getDefaultContent(variant)
  const finalContent: BaseNodeContent = {
    ...defaultContent,
    ...content,
    ui: {
      ...defaultContent.ui,
      ...content?.ui
    }
  }

  const { data, error } = await supabase
    .from('board_nodes')
    .insert({
      board_id: boardId,
      node_type: archetype,
      position_x: position.x,
      position_y: position.y,
      width: DEFAULT_WIDTH,
      height: getDefaultHeight(variant),
      content: finalContent,
      status: 'active',
      version: 1,
      parent_id: null,
      superseded_by: null,
      previous_version: null
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

// ============================================
// MUTATION: updateNode
// ============================================

interface UpdateNodeParams {
  content?: Partial<BaseNodeContent>
  position?: { x: number; y: number }
  size?: { width: number; height: number }
}

export async function updateNode(
  nodeId: string,
  updates: UpdateNodeParams
): Promise<BoardNode> {
  const supabase = await createClient()

  const payload: Record<string, unknown> = {}

  if (updates.content !== undefined) {
    const { data: current, error: fetchError } = await supabase
      .from('board_nodes')
      .select('content')
      .eq('id', nodeId)
      .eq('status', 'active')
      .single()

    if (fetchError) {
      throw new Error(`Node not found or removed: ${nodeId}`)
    }

    const currentContent = (current.content || {}) as BaseNodeContent
    const newContent: BaseNodeContent = {
      ...currentContent,
      ...updates.content,
      ui: {
        ...currentContent.ui,
        ...updates.content.ui
      }
    }

    payload.content = newContent
    payload.content_updated_at = new Date().toISOString()
  }

  if (updates.position !== undefined) {
    payload.position_x = updates.position.x
    payload.position_y = updates.position.y
  }

  if (updates.size !== undefined) {
    payload.width = updates.size.width
    payload.height = updates.size.height
  }

  if (Object.keys(payload).length === 0) {
    throw new Error('No fields to update')
  }

  const { data, error } = await supabase
    .from('board_nodes')
    .update(payload)
    .eq('id', nodeId)
    .eq('status', 'active')
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error(`Node not found or removed: ${nodeId}`)
    }
    throw new Error(error.message)
  }

  return data
}

// ============================================
// MUTATION: deleteNode (soft delete)
// ============================================

export async function deleteNode(nodeId: string): Promise<BoardNode> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('board_nodes')
    .update({ status: 'removed' })
    .eq('id', nodeId)
    .eq('status', 'active')
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error(`Node not found or already removed: ${nodeId}`)
    }
    throw new Error(error.message)
  }

  return data
}

// ============================================
// MUTATION: duplicateNode (for Copy/Paste)
// ============================================

export async function duplicateNode(nodeId: string): Promise<BoardNode> {
  const supabase = await createClient()

  const { data: original, error: fetchError } = await supabase
    .from('board_nodes')
    .select('*')
    .eq('id', nodeId)
    .eq('status', 'active')
    .single()

  if (fetchError || !original) {
    throw new Error(`Node not found or removed: ${nodeId}`)
  }

  const OFFSET = 30

  const { data, error } = await supabase
    .from('board_nodes')
    .insert({
      board_id: original.board_id,
      node_type: original.node_type,
      position_x: original.position_x + OFFSET,
      position_y: original.position_y + OFFSET,
      width: original.width,
      height: original.height,
      content: original.content,
      status: 'active',
      version: 1,
      parent_id: original.parent_id,
      superseded_by: null,
      previous_version: null
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}
