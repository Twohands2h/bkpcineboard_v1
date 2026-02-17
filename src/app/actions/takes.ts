'use server'

import { deleteTake } from '@/lib/db/queries/takes'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createTakeAction(data: {
  projectId: string
  shotId: string
}): Promise<{
  id: string
  shot_id: string
  status: string
  take_number: number
  created_at: string
}> {
  const supabase = await createClient()

  const { data: result, error } = await supabase
    .rpc('create_take_with_number', {
      p_project_id: data.projectId,
      p_shot_id: data.shotId,
    })
    .single()

  if (error) {
    throw new Error(`Failed to create take: ${error.message}`)
  }

  if (!result) {
    throw new Error('RPC returned no data')
  }

  // PostgREST returns OUT params as out_id, out_take_number, etc.
  const takeId = result.out_id ?? result.id
  const takeNumber = result.out_take_number ?? result.take_number
  const shotId = result.out_shot_id ?? result.shot_id ?? data.shotId
  const status = result.out_status ?? result.status ?? 'draft'
  const createdAt = result.out_created_at ?? result.created_at ?? new Date().toISOString()

  if (!takeId) throw new Error('Server did not return take id')
  if (!takeNumber) throw new Error('Server did not return take_number')

  revalidatePath(`/projects/${data.projectId}/shots/${data.shotId}`)

  return {
    id: takeId,
    shot_id: shotId,
    status,
    take_number: takeNumber,
    created_at: createdAt,
  }
}

export async function deleteTakeAction(data: {
  projectId: string
  shotId: string
  takeId: string
}) {
  await deleteTake(data.takeId)
  revalidatePath(`/projects/${data.projectId}/shots/${data.shotId}`)
}