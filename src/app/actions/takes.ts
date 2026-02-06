'use server'

import { createTake, deleteTake } from '@/lib/db/queries/takes'
import { revalidatePath } from 'next/cache'

export async function createTakeAction(data: {
  projectId: string
  shotId: string
}) {
  const take = await createTake(
    data.projectId,
    data.shotId,
    {
      media_type: 'video',
      status: 'draft'
    }
  )

  // UNICO revalidate
  revalidatePath(`/projects/${data.projectId}/shots/${data.shotId}`)

  return take
}
export async function deleteTakeAction(data: {
  projectId: string
  shotId: string
  takeId: string
}) {
  await deleteTake(data.takeId)
  revalidatePath(`/projects/${data.projectId}/shots/${data.shotId}`)
}