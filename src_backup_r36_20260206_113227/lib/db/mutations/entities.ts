import { createClient } from '@/lib/supabase/server'

// ============================================
// MUTATION: archiveEntity
// ============================================

/**
 * Soft delete di un'entity
 * 
 * Prima termina eventuali workspace link attivi,
 * poi imposta status = 'archived'
 * 
 * Coerente con il modello di Board e Node.
 * 
 * @param entityId - UUID dell'entity
 * @returns Entity archiviata
 */
export async function archiveEntity(entityId: string): Promise<{ id: string }> {
  const supabase = await createClient()
  
  // End any active workspace links for this entity
  await supabase
    .from('board_links')
    .update({ 
      status: 'ended',
      ended_at: new Date().toISOString()
    })
    .eq('target_type', 'entity')
    .eq('target_id', entityId)
    .eq('status', 'active')
  
  // Archive the entity (soft delete)
  const { data, error } = await supabase
    .from('entities')
    .update({ status: 'archived' })
    .eq('id', entityId)
    .select('id')
    .single()
  
  if (error) {
    throw new Error(`Failed to archive entity: ${error.message}`)
  }
  
  return data
}
