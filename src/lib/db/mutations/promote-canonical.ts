import { createClient } from '@/lib/supabase/server'

// ============================================
// PROMOTE TO MASTER PROMPT
// ============================================

/**
 * Promote a Prompt node's content to Entity master_prompt
 * Replaces existing master_prompt (no versioning)
 */
export async function promoteToMasterPrompt(
  entityId: string, 
  promptContent: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('entities')
    .update({ 
      master_prompt: promptContent,
      updated_at: new Date().toISOString()
    })
    .eq('id', entityId)
  
  if (error) {
    console.error('Error promoting to master_prompt:', error)
    return { success: false, error: error.message }
  }
  
  return { success: true }
}

// ============================================
// PROMOTE TO REFERENCE IMAGES
// ============================================

/**
 * Promote an Image node's content to Entity reference_images
 * @param mode 'append' adds to existing images, 'replace' overwrites all
 */
export async function promoteToReferenceImages(
  entityId: string,
  imageUrl: string,
  mode: 'append' | 'replace' = 'append'
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  
  // Replace mode: overwrite with single image
  if (mode === 'replace') {
    const { error } = await supabase
      .from('entities')
      .update({ 
        reference_images: [imageUrl],
        updated_at: new Date().toISOString()
      })
      .eq('id', entityId)
    
    if (error) {
      console.error('Error replacing reference_images:', error)
      return { success: false, error: error.message }
    }
    return { success: true }
  }
  
  // Append mode: add to existing images
  const { data: entity, error: fetchError } = await supabase
    .from('entities')
    .select('reference_images')
    .eq('id', entityId)
    .single()
  
  if (fetchError) {
    console.error('Error fetching entity for append:', fetchError)
    return { success: false, error: fetchError.message }
  }
  
  const existingImages = (entity?.reference_images as string[]) || []
  
  // Avoid duplicates - silent success if already exists
  if (existingImages.includes(imageUrl)) {
    return { success: true }
  }
  
  const { error: updateError } = await supabase
    .from('entities')
    .update({ 
      reference_images: [...existingImages, imageUrl],
      updated_at: new Date().toISOString()
    })
    .eq('id', entityId)
  
  if (updateError) {
    console.error('Error appending to reference_images:', updateError)
    return { success: false, error: updateError.message }
  }
  
  return { success: true }
}

// ============================================
// PROMOTE TO SHOT DESCRIPTION
// ============================================

/**
 * Promote content to Shot description
 * Replaces existing description (no versioning)
 */
export async function promoteToShotDescription(
  shotId: string,
  description: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('shots')
    .update({ 
      description: description,
      updated_at: new Date().toISOString()
    })
    .eq('id', shotId)
  
  if (error) {
    console.error('Error promoting to shot description:', error)
    return { success: false, error: error.message }
  }
  
  return { success: true }
}
