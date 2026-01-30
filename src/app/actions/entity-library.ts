'use server'

import { createClient } from '@/lib/supabase/server'

// ============================================
// TYPES
// ============================================

export interface LibraryEntity {
  id: string
  name: string
  type: 'character' | 'environment' | 'asset'
  slug: string
  description: string | null
  master_prompt: string | null
  reference_images: string[] | null
  project_id: string
}

export interface EntityDetailWithWorkspace extends LibraryEntity {
  status: 'active' | 'archived'
  workspace: {
    board_id: string
    board_title: string
  } | null
}

// ============================================
// ACTION: Get Entities for Library
// ============================================

/**
 * Recupera tutte le entities attive di un progetto
 * per la Entity Library.
 */
export async function getEntitiesForLibraryAction(
  projectId: string
): Promise<LibraryEntity[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('entities')
    .select('id, name, type, slug, description, master_prompt, reference_images, project_id')
    .eq('project_id', projectId)
    .eq('status', 'active')
    .order('type')
    .order('name')

  if (error) {
    console.error('Failed to fetch entities for library:', error)
    throw new Error('Failed to fetch entities')
  }

  return data as LibraryEntity[]
}

// ============================================
// ACTION: Get Entity Detail with Workspace
// ============================================

/**
 * Recupera dettaglio entity con info workspace.
 * Include anche entity archiviate (per visualizzazione read-only)
 */
export async function getEntityDetailAction(
  entityId: string
): Promise<EntityDetailWithWorkspace | null> {
  const supabase = await createClient()

  // Fetch entity (inclusa archiviata - no filtro status)
  const { data: entity, error: entityError } = await supabase
    .from('entities')
    .select('id, name, type, slug, description, master_prompt, reference_images, project_id, status')
    .eq('id', entityId)
    .single()

  if (entityError) {
    if (entityError.code === 'PGRST116') return null
    console.error('Failed to fetch entity detail:', entityError)
    throw new Error('Failed to fetch entity')
  }

  // Fetch workspace link (solo se entity è attiva)
  let workspace = null
  if (entity.status === 'active') {
    const { data: workspaceLink } = await supabase
      .from('board_links')
      .select('board_id, boards!inner(title)')
      .eq('target_type', 'entity')
      .eq('target_id', entityId)
      .eq('link_type', 'workspace')
      .eq('status', 'active')
      .maybeSingle()

    if (workspaceLink) {
      const linkData = workspaceLink as { board_id: string; boards: { title: string } }
      workspace = {
        board_id: linkData.board_id,
        board_title: linkData.boards.title,
      }
    }
  }

  return {
    ...entity,
    workspace,
  } as EntityDetailWithWorkspace
}

// ============================================
// ACTION: Create Entity Workspace
// ============================================

interface CreateWorkspaceResult {
  success: boolean
  error?: string
  workspace?: {
    board_id: string
    board_title: string
  }
}

export async function createEntityWorkspaceAction(
  entityId: string,
  projectId: string
): Promise<CreateWorkspaceResult> {
  const supabase = await createClient()

  try {
    // 1. Fetch entity per nome e tipo
    const { data: entity, error: entityError } = await supabase
      .from('entities')
      .select('id, name, type, reference_images')
      .eq('id', entityId)
      .single()

    if (entityError || !entity) {
      return { success: false, error: 'Entity not found' }
    }

    // 2. Verifica che non esista già una workspace
    const { data: existingLink } = await supabase
      .from('board_links')
      .select('id')
      .eq('target_type', 'entity')
      .eq('target_id', entityId)
      .eq('link_type', 'workspace')
      .eq('status', 'active')
      .maybeSingle()

    if (existingLink) {
      return { success: false, error: 'Workspace already exists' }
    }

    // 3. Crea nuova board
    const boardTitle = `${entity.name} — Workspace`
    const { data: newBoard, error: boardError } = await supabase
      .from('boards')
      .insert({
        project_id: projectId,
        title: boardTitle,
        description: `Workspace for ${entity.type}: ${entity.name}`,
      })
      .select('id')
      .single()

    if (boardError) {
      return { success: false, error: 'Failed to create board' }
    }

    // 4. Crea workspace link
    await supabase.from('board_links').insert({
      board_id: newBoard.id,
      link_type: 'workspace',
      target_type: 'entity',
      target_id: entityId,
      status: 'active',
    })

    // 5. Crea EntityRefNode nella nuova workspace
    const entityRefContent = {
      variant: 'entity',
      ref_type: 'entity',
      ref_id: entityId,
      entity_type: entity.type,
      display_title: entity.name,
      display_image: entity.reference_images?.[0] || null,
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

    return {
      success: true,
      workspace: {
        board_id: newBoard.id,
        board_title: boardTitle,
      },
    }

  } catch (error) {
    console.error('Create workspace failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
