'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

/**
 * Delete shot with redirect (STUB per compilazione)
 */
export async function deleteShotWithRedirectAction(
  shotId: string,
  projectId: string
): Promise<void> {
  // TODO: implementare delete
  console.log('Delete shot:', shotId)
  
  revalidatePath(`/projects/${projectId}`)
  redirect(`/projects/${projectId}`)
}

/**
 * Create shot action (placeholder)
 */
export async function createShotAction(): Promise<void> {
  throw new Error('Not implemented')
}

/**
 * Update shot action (placeholder)
 */
export async function updateShotAction(): Promise<void> {
  throw new Error('Not implemented')
}
