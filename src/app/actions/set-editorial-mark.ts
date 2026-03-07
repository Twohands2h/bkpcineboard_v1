'use server'

import { createClient } from '@/lib/supabase/server'

export type EditorialMark = 'select' | 'alt' | 'reject' | null

export async function setEditorialMarkAction({
  takeId,
  mark,
  note,
}: {
  takeId: string
  mark: EditorialMark
  note?: string
}): Promise<void> {
  const supabase = await createClient()
  await supabase
    .from('takes')
    .update({ editorial_mark: mark ?? null, editorial_note: note ?? null })
    .eq('id', takeId)
}
