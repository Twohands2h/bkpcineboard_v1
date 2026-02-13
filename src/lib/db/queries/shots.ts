import { createClient } from '@/lib/supabase/server'

export interface Shot {
  id: string
  project_id: string
  scene_id: string
  visual_description: string
  technical_notes: string | null
  order_index: number
  status: string
  created_at: string
  updated_at: string
}

/**
 * Get single shot by id
 */
export async function getShot(shotId: string): Promise<Shot | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('shots')
    .select('*')
    .eq('id', shotId)
    .single()

  if (error) return null
  return data as Shot
}

/**
 * Alias di getShot (per compatibilità)
 */
export async function getShotById(shotId: string): Promise<Shot | null> {
  return getShot(shotId)
}

/**
 * Get shots by project
 */
export async function getShotsByProject(projectId: string): Promise<Shot[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('shots')
    .select('*')
    .eq('project_id', projectId)
    .order('order_index', { ascending: true })

  if (error) return []
  return data as Shot[]
}

/**
 * Get shots by entity (STUB)
 */
export async function getShotsByEntity(_entityId: string): Promise<Shot[]> {
  return []
}

/**
 * Get shots by shotlist (STUB - legacy)
 */
export async function getShotsByShotlist(_shotlistId: string): Promise<Shot[]> {
  return []
}

/**
 * Create shot (STUB)
 */
export async function createShot(
  _projectId: string,
  _sceneId: string,
  _data: Partial<Shot>
): Promise<Shot> {
  throw new Error('createShot not implemented')
}

/**
 * Update shot (STUB)
 */
export async function updateShot(
  _shotId: string,
  _data: Partial<Shot>
): Promise<Shot> {
  throw new Error('updateShot not implemented')
}

/**
 * Delete shot (STUB)
 */
export async function deleteShot(_shotId: string): Promise<void> {
  throw new Error('deleteShot not implemented')
}

/**
 * Get or create shotlist (STUB - legacy)
 */
export async function getOrCreateShotlist(_projectId: string): Promise<any> {
  throw new Error('getOrCreateShotlist not implemented - legacy function')
}

/**
 * List shots for a scene — minimal fields for strip navigation.
 * Includes final_visual_selection_id + approved_take_id for status derivation.
 */
export async function listSceneShots(sceneId: string): Promise<{
  id: string
  scene_id: string
  order_index: number
  visual_description: string
  final_visual_selection_id: string | null
  approved_take_id: string | null
}[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('shots')
    .select('id, scene_id, order_index, visual_description, final_visual_selection_id, approved_take_id')
    .eq('scene_id', sceneId)
    .order('order_index', { ascending: true })

  if (error) return []
  return (data ?? []) as any[]
}