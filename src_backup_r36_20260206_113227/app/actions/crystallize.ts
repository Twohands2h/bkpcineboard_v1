'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// ============================================
// TYPES
// ============================================

export type CrystallizeEntityType = 'character' | 'environment' | 'asset'

export type WorkspaceChoice = 'use-current' | 'create-new' | 'no-workspace'

export interface SelectedNodeContent {
  images: Array<{ url: string; caption?: string }>
  prompts: Array<{ title: string; body: string }>
  notes: Array<{ title: string; body: string }>
}

interface CrystallizeInput {
  sourceBoardId: string
  projectId: string
  entityType: CrystallizeEntityType
  name: string
  selectedNodeIds: string[]
  masterPromptIndex: number
}

interface WorkspaceInput {
  sourceBoardId: string
  projectId: string
  entityId: string
  entityName: string
  entityType: CrystallizeEntityType
  workspaceChoice: WorkspaceChoice
}

// Nodo completo per l'aggiunta al canvas
export interface CreatedEntityRefNode {
  id: string
  board_id: string
  node_type: string
  position_x: number
  position_y: number
  width: number
  height: number
  content: Record<string, unknown>
  status: string
}

interface CrystallizeResult {
  entityId: string
  entityRefNode: CreatedEntityRefNode
  archivedNodeIds: string[]
}

interface CrystallizeActionResult {
  success: boolean
  error?: string
  result?: CrystallizeResult
}

interface WorkspaceResult {
  workspaceBoardId: string
  workspaceUrl: string
}

interface WorkspaceActionResult {
  success: boolean
  error?: string
  result?: WorkspaceResult
}

// ============================================
// HELPER: Generate slug
// ============================================

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50)
}

// ============================================
// ACTION: Get Selected Nodes Content
// ============================================

export async function getSelectedNodesContentAction(
  nodeIds: string[]
): Promise<SelectedNodeContent> {
  const supabase = await createClient()

  const { data: nodes, error } = await supabase
    .from('board_nodes')
    .select('content')
    .in('id', nodeIds)
    .eq('status', 'active')

  if (error) throw new Error(error.message)

  const result: SelectedNodeContent = {
    images: [],
    prompts: [],
    notes: [],
  }

  for (const node of nodes || []) {
    const content = node.content as Record<string, unknown>
    const variant = content?.variant as string

    if (variant === 'image') {
      const items = content.items as Array<{ url: string; caption?: string }> | undefined
      if (items) {
        result.images.push(...items)
      }
    } else if (variant === 'prompt') {
      result.prompts.push({
        title: (content.title as string) || '',
        body: (content.body as string) || '',
      })
    } else if (variant === 'note') {
      result.notes.push({
        title: (content.title as string) || '',
        body: (content.body as string) || '',
      })
    }
  }

  return result
}

// ============================================
// ACTION: Crystallize Phase 1 (Atomica)
// Crea Entity + EntityRefNode, archivia nodi selezionati
// NON gestisce workspace - quello è Phase 2
// ============================================

export async function crystallizeAction(
  input: CrystallizeInput
): Promise<CrystallizeActionResult> {
  const supabase = await createClient()
  const { 
    sourceBoardId, 
    projectId, 
    entityType, 
    name, 
    selectedNodeIds, 
    masterPromptIndex,
  } = input

  try {
    // ============================================
    // 1. Load selected nodes content
    // ============================================
    
    const { data: selectedNodes, error: nodesError } = await supabase
      .from('board_nodes')
      .select('id, content, position_x, position_y')
      .in('id', selectedNodeIds)
      .eq('status', 'active')

    if (nodesError) throw new Error(nodesError.message)
    if (!selectedNodes || selectedNodes.length === 0) {
      throw new Error('No valid nodes selected')
    }

    // ============================================
    // 2. Extract canonical data from nodes
    // ============================================

    const images: string[] = []
    const prompts: Array<{ title: string; body: string }> = []
    const notes: Array<{ title: string; body: string }> = []

    for (const node of selectedNodes) {
      const content = node.content as Record<string, unknown>
      const variant = content?.variant as string

      if (variant === 'image') {
        const items = content.items as Array<{ url: string }> | undefined
        if (items) {
          images.push(...items.map(i => i.url))
        }
      } else if (variant === 'prompt') {
        prompts.push({
          title: (content.title as string) || '',
          body: (content.body as string) || '',
        })
      } else if (variant === 'note') {
        notes.push({
          title: (content.title as string) || '',
          body: (content.body as string) || '',
        })
      }
    }

    // Determine master prompt and additional notes
    let masterPrompt = ''
    const allNotes: string[] = []

    if (prompts.length > 0) {
      const masterIndex = Math.min(masterPromptIndex, prompts.length - 1)
      masterPrompt = prompts[masterIndex].body

      // Other prompts become notes
      prompts.forEach((p, i) => {
        if (i !== masterIndex && p.body) {
          allNotes.push(`[Prompt] ${p.title || 'Untitled'}\n${p.body}`)
        }
      })
    }

    // Add actual notes
    notes.forEach(n => {
      if (n.body) {
        allNotes.push(`${n.title || 'Note'}\n${n.body}`)
      }
    })

    const mergedNotes = allNotes.join('\n\n---\n\n')

    // ============================================
    // 3. Create Entity
    // ============================================

    const slug = generateSlug(name)

    const { data: entity, error: entityError } = await supabase
      .from('entities')
      .insert({
        project_id: projectId,
        name,
        slug,
        type: entityType,
        master_prompt: masterPrompt,
        reference_images: images,
        description: mergedNotes || null,
      })
      .select('id')
      .single()

    if (entityError) throw new Error(`Failed to create entity: ${entityError.message}`)

    // ============================================
    // 4. Calculate EntityRefNode position
    // ============================================
    // Posiziona dove si trova il nodo più in alto a sinistra (top-left)
    // Questo è più intuitivo e evita sovrapposizioni se si creano più entity

    let refNodeX = 100
    let refNodeY = 100

    if (selectedNodes.length > 0) {
      // Trova il nodo più in alto (minY), a parità il più a sinistra (minX)
      const topLeftNode = selectedNodes.reduce((best, current) => {
        const currentY = current.position_y || 0
        const bestY = best.position_y || 0
        const currentX = current.position_x || 0
        const bestX = best.position_x || 0
        
        if (currentY < bestY) return current
        if (currentY === bestY && currentX < bestX) return current
        return best
      }, selectedNodes[0])
      
      refNodeX = Math.round(topLeftNode.position_x || 100)
      refNodeY = Math.round(topLeftNode.position_y || 100)
    }

    // ============================================
    // 5. Archive selected nodes (soft delete)
    // ============================================

    const { error: archiveError } = await supabase
      .from('board_nodes')
      .update({ status: 'removed' })  // Usa 'removed' come da schema esistente
      .in('id', selectedNodeIds)

    if (archiveError) {
      console.error('Failed to remove selected nodes:', archiveError)
    }

    // ============================================
    // 6. Create EntityRefNode in source board
    // ============================================

    const entityRefContent = {
      variant: 'entity',
      ref_type: 'entity',
      ref_id: entity.id,
      entity_type: entityType,
      display_title: name,
      display_image: images[0] || null,
      ui: { collapsed: false },
    }

    const { data: refNode, error: refError } = await supabase
      .from('board_nodes')
      .insert({
        board_id: sourceBoardId,
        node_type: 'reference',
        position_x: refNodeX,
        position_y: refNodeY,
        width: 64,
        height: 64,
        content: entityRefContent,
        status: 'active',
      })
      .select('*')
      .single()

    if (refError) throw new Error(`Failed to create EntityRef node: ${refError.message}`)

    // ============================================
    // 7. Revalidate entity paths
    // ============================================

    revalidatePath(`/projects/${projectId}/entities`)
    revalidatePath(`/projects/${projectId}/entities/${entity.id}`)

    // ============================================
    // 8. Return result with full node data
    // ============================================

    return {
      success: true,
      result: {
        entityId: entity.id,
        entityRefNode: refNode as CreatedEntityRefNode,
        archivedNodeIds: selectedNodeIds,
      },
    }

  } catch (error) {
    console.error('Crystallize failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// ============================================
// ACTION: Setup Workspace (Phase 2)
// Chiamata DOPO crystallize, se l'utente sceglie A o B
// ============================================

export async function setupWorkspaceAction(
  input: WorkspaceInput
): Promise<WorkspaceActionResult> {
  const supabase = await createClient()
  const { 
    sourceBoardId, 
    projectId, 
    entityId,
    entityName,
    entityType,
    workspaceChoice,
  } = input

  try {
    if (workspaceChoice === 'no-workspace') {
      // Nessuna azione necessaria
      return {
        success: true,
        result: {
          workspaceBoardId: sourceBoardId,
          workspaceUrl: `/projects/${projectId}/boards/${sourceBoardId}`,
        },
      }
    }

    let workspaceBoardId: string

    if (workspaceChoice === 'use-current') {
      // Case A: Current board becomes workspace
      workspaceBoardId = sourceBoardId

      // Create workspace link
      await supabase.from('board_links').insert({
        board_id: sourceBoardId,
        link_type: 'workspace',
        target_type: 'entity',
        target_id: entityId,
        status: 'active',
      })

    } else {
      // Case B: Create new workspace board
      const { data: newBoard, error: boardError } = await supabase
        .from('boards')
        .insert({
          project_id: projectId,
          title: `${entityName} — Workspace`,
          description: `Workspace for ${entityType}: ${entityName}`,
        })
        .select('id')
        .single()

      if (boardError) throw new Error(`Failed to create workspace board: ${boardError.message}`)

      workspaceBoardId = newBoard.id

      // Create workspace link for new board
      await supabase.from('board_links').insert({
        board_id: newBoard.id,
        link_type: 'workspace',
        target_type: 'entity',
        target_id: entityId,
        status: 'active',
      })

      // Create EntityRefNode in new workspace
      const { data: entityData } = await supabase
        .from('entities')
        .select('reference_images')
        .eq('id', entityId)
        .single()

      const entityRefContent = {
        variant: 'entity',
        ref_type: 'entity',
        ref_id: entityId,
        entity_type: entityType,
        display_title: entityName,
        display_image: entityData?.reference_images?.[0] || null,
        ui: { collapsed: false },
      }

      await supabase.from('board_nodes').insert({
        board_id: newBoard.id,
        node_type: 'reference',
        position_x: 100,
        position_y: 100,
        width: 64,
        height: 64,
        content: entityRefContent,
        status: 'active',
      })
    }

    // Revalidate paths
    revalidatePath(`/projects/${projectId}/boards`)
    revalidatePath(`/projects/${projectId}/boards/${sourceBoardId}`)
    revalidatePath(`/projects/${projectId}/boards/${workspaceBoardId}`)

    return {
      success: true,
      result: {
        workspaceBoardId,
        workspaceUrl: `/projects/${projectId}/boards/${workspaceBoardId}`,
      },
    }

  } catch (error) {
    console.error('Setup workspace failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
