import { createClient } from '@/lib/supabase/server'

// ============================================
// TYPES
// ============================================

export type CrystallizeTargetType = 'character' | 'environment' | 'asset' | 'shot'

export interface CrystallizeInput {
  sourceBoardId: string
  projectId: string
  targetType: CrystallizeTargetType
  name: string
  selectedNodeIds: string[]
}

export interface CrystallizeResult {
  entityId?: string
  shotId?: string
  boardId: string
  boardUrl: string
}

// ============================================
// HELPER: Generate slug from name
// ============================================

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50)
}

// ============================================
// MUTATION: Crystallize
// ============================================

/**
 * Crystallize Flow:
 * 1. Crea Entity o Shot
 * 2. Crea Board Workspace (1:1)
 * 3. Copia nodi selezionati nella nuova Board
 * 4. Crea link workspace
 * 
 * La Board originale resta invariata.
 * I nodi copiati sono indipendenti (nessun link).
 */
export async function crystallize(input: CrystallizeInput): Promise<CrystallizeResult> {
  const supabase = await createClient()
  const { sourceBoardId, projectId, targetType, name, selectedNodeIds } = input

  // ============================================
  // 1. Crea Entity o Shot
  // ============================================

  let entityId: string | undefined
  let shotId: string | undefined

  if (targetType === 'shot') {
    // Trova shotlist del progetto
    const { data: shotlist } = await supabase
      .from('shotlists')
      .select('id')
      .eq('project_id', projectId)
      .single()

    if (!shotlist) {
      throw new Error('No shotlist found for project')
    }

    // Conta shots esistenti per generare shot_number
    const { count } = await supabase
      .from('shots')
      .select('*', { count: 'exact', head: true })
      .eq('shotlist_id', shotlist.id)

    const shotNumber = String((count || 0) + 1).padStart(3, '0')

    // Crea Shot
    const { data: shot, error: shotError } = await supabase
      .from('shots')
      .insert({
        shotlist_id: shotlist.id,
        title: name,
        shot_number: shotNumber,
        status: 'planning',
        order_index: (count || 0) + 1
      })
      .select()
      .single()

    if (shotError) throw new Error(`Failed to create shot: ${shotError.message}`)
    shotId = shot.id

  } else {
    // Crea Entity (character/environment/asset)
    const slug = generateSlug(name)

    // Check slug uniqueness
    const { data: existing } = await supabase
      .from('entities')
      .select('id')
      .eq('project_id', projectId)
      .eq('slug', slug)
      .maybeSingle()

    const finalSlug = existing ? `${slug}-${Date.now()}` : slug

    const { data: entity, error: entityError } = await supabase
      .from('entities')
      .insert({
        project_id: projectId,
        type: targetType,
        name: name,
        slug: finalSlug
      })
      .select()
      .single()

    if (entityError) throw new Error(`Failed to create entity: ${entityError.message}`)
    entityId = entity.id
  }

  // ============================================
  // 2. Crea Board Workspace
  // ============================================

  const boardTitle = targetType === 'shot' 
    ? `${name} — Workspace`
    : `${name} — Workspace`

  const { data: board, error: boardError } = await supabase
    .from('boards')
    .insert({
      project_id: projectId,
      title: boardTitle,
      status: 'active'
    })
    .select()
    .single()

  if (boardError) throw new Error(`Failed to create board: ${boardError.message}`)

  // ============================================
  // 3. Crea link Workspace (1:1)
  // ============================================

  const { error: linkError } = await supabase
    .from('board_links')
    .insert({
      board_id: board.id,
      link_type: 'workspace',
      target_type: targetType === 'shot' ? 'shot' : 'entity',
      target_id: targetType === 'shot' ? shotId : entityId,
      status: 'active'
    })

  if (linkError) throw new Error(`Failed to create workspace link: ${linkError.message}`)

  // ============================================
  // 4. Copia nodi selezionati
  // ============================================

  console.log('Crystallize: selectedNodeIds =', selectedNodeIds)

  if (selectedNodeIds.length > 0) {
    // Fetch nodi originali
    const { data: sourceNodes, error: fetchError } = await supabase
      .from('board_nodes')
      .select('*')
      .in('id', selectedNodeIds)
      .eq('status', 'active')

    console.log('Crystallize: sourceNodes fetched =', sourceNodes?.length, 'error =', fetchError)

    if (fetchError) throw new Error(`Failed to fetch source nodes: ${fetchError.message}`)

    if (sourceNodes && sourceNodes.length > 0) {
      // Prepara copie (nuovi ID, nuova board)
      const nodeCopies = sourceNodes.map(node => ({
        board_id: board.id,
        node_type: node.node_type,
        position_x: node.position_x,
        position_y: node.position_y,
        width: node.width,
        height: node.height,
        content: node.content,
        status: 'active'
      }))

      console.log('Crystallize: inserting', nodeCopies.length, 'nodes into board', board.id)

      const { error: insertError } = await supabase
        .from('board_nodes')
        .insert(nodeCopies)

      if (insertError) throw new Error(`Failed to copy nodes: ${insertError.message}`)
      
      console.log('Crystallize: nodes copied successfully')
    }
  }

  // ============================================
  // 5. Return result
  // ============================================

  return {
    entityId,
    shotId,
    boardId: board.id,
    boardUrl: `/projects/${projectId}/boards/${board.id}`
  }
}
