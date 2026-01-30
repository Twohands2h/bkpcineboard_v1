'use server'

import { revalidatePath } from 'next/cache'
import { 
  promoteToMasterPrompt, 
  promoteToReferenceImages,
  promoteToShotDescription 
} from '@/lib/db/mutations/promote-canonical'

// ============================================
// PROMOTE TO MASTER PROMPT
// ============================================

export async function promoteToMasterPromptAction(
  entityId: string,
  projectId: string,
  promptContent: string
): Promise<{ success: boolean; error?: string }> {
  const result = await promoteToMasterPrompt(entityId, promptContent)
  
  if (result.success) {
    // Revalidate entity pages to show updated canonical content
    revalidatePath(`/projects/${projectId}/entities/${entityId}`)
    revalidatePath(`/projects/${projectId}/entities`)
    // Revalidate board page to update badges
    revalidatePath(`/projects/${projectId}/boards`)
  }
  
  return result
}

// ============================================
// PROMOTE TO REFERENCE IMAGES
// ============================================

export async function promoteToReferenceImagesAction(
  entityId: string,
  projectId: string,
  imageUrl: string,
  mode: 'append' | 'replace' = 'append'
): Promise<{ success: boolean; error?: string }> {
  const result = await promoteToReferenceImages(entityId, imageUrl, mode)
  
  if (result.success) {
    // Revalidate entity pages to show updated canonical content
    revalidatePath(`/projects/${projectId}/entities/${entityId}`)
    revalidatePath(`/projects/${projectId}/entities`)
    // Revalidate board page to update badges
    revalidatePath(`/projects/${projectId}/boards`)
  }
  
  return result
}

// ============================================
// PROMOTE TO SHOT DESCRIPTION
// ============================================

export async function promoteToShotDescriptionAction(
  shotId: string,
  projectId: string,
  description: string
): Promise<{ success: boolean; error?: string }> {
  const result = await promoteToShotDescription(shotId, description)
  
  if (result.success) {
    // Revalidate shot pages to show updated canonical content
    revalidatePath(`/projects/${projectId}/shotlist/${shotId}`)
    revalidatePath(`/projects/${projectId}/shotlist`)
    // Revalidate board page to update badges
    revalidatePath(`/projects/${projectId}/boards`)
  }
  
  return result
}
