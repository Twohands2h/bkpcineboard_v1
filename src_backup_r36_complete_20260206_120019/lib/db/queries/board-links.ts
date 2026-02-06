import { createClient } from '@/lib/supabase/server'

// ============================================
// TYPES
// ============================================

export interface BoardWorkspaceInfo {
  link_id: string
  target_type: 'entity' | 'shot'
  target_id: string
  target_name: string
  target_url: string
}

// ============================================
// QUERY: Get Board Workspace Link
// ============================================

/**
 * Ritorna il workspace link di una Board (se esiste)
 * Una Board può avere al massimo UN workspace link
 */
export async function getBoardWorkspaceLink(
  boardId: string
): Promise<BoardWorkspaceInfo | null> {
  const supabase = await createClient()

  // Fetch workspace link
  const { data: link, error } = await supabase
    .from('board_links')
    .select('id, target_type, target_id')
    .eq('board_id', boardId)
    .eq('link_type', 'workspace')
    .eq('status', 'active')
    .maybeSingle()

  if (error) {
    console.error('Failed to fetch board workspace link:', error)
    return null
  }

  if (!link) {
    return null
  }

  // Fetch target name based on type
  let targetName = 'Unknown'
  let targetUrl = ''

  if (link.target_type === 'entity') {
    const { data: entity } = await supabase
      .from('entities')
      .select('name, project_id')
      .eq('id', link.target_id)
      .single()

    if (entity) {
      targetName = entity.name
      targetUrl = `/projects/${entity.project_id}/entities/${link.target_id}`
    }
  } else if (link.target_type === 'shot') {
    const { data: shot } = await supabase
      .from('shots')
      .select('visual_description, shot_number, scene_id, scenes!inner(project_id)')
      .eq('id', link.target_id)
      .single()

    if (shot) {
      // Supabase returns !inner relations as arrays, access first element
      const scenes = shot.scenes as unknown as { project_id: string }[]
      const projectId = scenes?.[0]?.project_id
      targetName = shot.visual_description || `Shot ${shot.shot_number}`
      targetUrl = projectId ? `/projects/${projectId}/shots/${link.target_id}` : ''
    }
  }

  return {
    link_id: link.id,
    target_type: link.target_type as 'entity' | 'shot',
    target_id: link.target_id,
    target_name: targetName,
    target_url: targetUrl
  }
}

// ============================================
// QUERY: Check if Entity/Shot already has workspace
// ============================================

/**
 * Verifica se un Entity o Shot ha già una Board workspace assegnata
 */
export async function getWorkspaceBoardForTarget(
  targetType: 'entity' | 'shot',
  targetId: string
): Promise<{ board_id: string; board_title: string } | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('board_links')
    .select('board_id, boards!inner(title)')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .eq('link_type', 'workspace')
    .eq('status', 'active')
    .maybeSingle()

  if (error || !data) {
    return null
  }

  // Supabase returns !inner relations as arrays, access first element
  const boards = data.boards as unknown as { title: string }[]
  const boardTitle = boards?.[0]?.title || 'Untitled'

  return {
    board_id: data.board_id,
    board_title: boardTitle
  }
}

// ============================================
// QUERY: Get available Entities for workspace
// ============================================

export async function getEntitiesForWorkspace(
  projectId: string
): Promise<Array<{ id: string; name: string; type: string; has_workspace: boolean }>> {
  const supabase = await createClient()

  // Get all entities
  const { data: entities, error } = await supabase
    .from('entities')
    .select('id, name, type')
    .eq('project_id', projectId)
    .order('name')

  if (error || !entities) {
    return []
  }

  // Get entities that already have workspace
  const { data: existingWorkspaces } = await supabase
    .from('board_links')
    .select('target_id')
    .eq('target_type', 'entity')
    .eq('link_type', 'workspace')
    .eq('status', 'active')

  const workspaceTargetIds = new Set(existingWorkspaces?.map(w => w.target_id) || [])

  return entities.map(e => ({
    id: e.id,
    name: e.name,
    type: e.type,
    has_workspace: workspaceTargetIds.has(e.id)
  }))
}

// ============================================
// QUERY: Get available Shots for workspace
// ============================================

export async function getShotsForWorkspace(
  projectId: string
): Promise<Array<{ id: string; title: string; shot_number: string; has_workspace: boolean }>> {
  const supabase = await createClient()

  // Get all shots for project via scenes
  const { data: shots, error } = await supabase
    .from('shots')
    .select('id, visual_description, shot_number, scene_id, scenes!inner(project_id)')
    .eq('scenes.project_id', projectId)
    .order('shot_number')

  if (error || !shots) {
    return []
  }

  // Get shots that already have workspace
  const { data: existingWorkspaces } = await supabase
    .from('board_links')
    .select('target_id')
    .eq('target_type', 'shot')
    .eq('link_type', 'workspace')
    .eq('status', 'active')

  const workspaceTargetIds = new Set(existingWorkspaces?.map(w => w.target_id) || [])

  return shots.map(s => ({
    id: s.id,
    title: s.visual_description || `Shot ${s.shot_number}`,
    shot_number: s.shot_number,
    has_workspace: workspaceTargetIds.has(s.id)
  }))
}
