'use server'

import { createClient } from '@/lib/supabase/server'

export async function getShotMediaRatings({ shotId }: { shotId: string }): Promise<Record<string, number>> {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('shot_media_ratings')
        .select('storage_path, rating')
        .eq('shot_id', shotId)

    if (error) { console.error('getShotMediaRatings error:', error); return {} }

    const map: Record<string, number> = {}
    for (const row of data ?? []) {
        map[row.storage_path] = row.rating
    }
    return map
}

export async function setShotMediaRating({ shotId, storagePath, rating }: {
    shotId: string
    storagePath: string
    rating: number
}): Promise<void> {
    const supabase = await createClient()

    if (rating === 0) {
        await supabase
            .from('shot_media_ratings')
            .delete()
            .eq('shot_id', shotId)
            .eq('storage_path', storagePath)
        return
    }

    const { error } = await supabase
        .from('shot_media_ratings')
        .upsert(
            { shot_id: shotId, storage_path: storagePath, rating, updated_at: new Date().toISOString() },
            { onConflict: 'shot_id,storage_path' }
        )

    if (error) console.error('setShotMediaRating error:', error)
}