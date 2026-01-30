'use server'

import { revalidatePath } from 'next/cache'
import { archiveEntity } from '@/lib/db/mutations/entities'

/**
 * Server Action: Delete (archive) an entity
 * 
 * Soft delete - ends workspace links and sets status = 'archived'
 * Coerente con il modello di Board e Node.
 * 
 * @param entityId - UUID dell'entity
 * @param projectId - UUID del progetto (per revalidation)
 * @returns { success: boolean }
 */
export async function deleteEntityAction(
  entityId: string,
  projectId: string
): Promise<{ success: boolean }> {
  await archiveEntity(entityId)
  
  revalidatePath(`/projects/${projectId}/entities`)
  
  return { success: true }
}
