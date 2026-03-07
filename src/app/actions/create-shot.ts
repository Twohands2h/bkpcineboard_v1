'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createShotAction(data: {
    projectId: string
    sceneId: string
    name: string
    tag?: string
    afterShotId?: string   // if set: insert right after this shot; otherwise append at end
}): Promise<{ id: string; order_index: number }> {
    const supabase = await createClient()

    // Fetch all shots in scene (ordered) to compute placement
    const { data: existing, error: fetchError } = await supabase
        .from('shots')
        .select('id, order_index')
        .eq('scene_id', data.sceneId)
        .order('order_index', { ascending: true })

    if (fetchError) throw new Error(`Failed to fetch shots: ${fetchError.message}`)

    const shots = existing ?? []

    let insertAt: number

    if (data.afterShotId) {
        const anchor = shots.find(s => s.id === data.afterShotId)
        if (!anchor) throw new Error('afterShotId not found in scene')

        insertAt = anchor.order_index + 1

        // Shift all shots with order_index >= insertAt
        const toShift = shots.filter(s => s.order_index >= insertAt)
        for (const s of toShift) {
            await supabase
                .from('shots')
                .update({ order_index: s.order_index + 1 })
                .eq('id', s.id)
        }
    } else {
        // Append at end
        insertAt = shots.length > 0 ? shots[shots.length - 1].order_index + 1 : 0
    }

    const visualDescription = data.tag
        ? `${data.name} [${data.tag}]`
        : data.name

    const { data: shot, error } = await supabase
        .from('shots')
        .insert({
            project_id: data.projectId,
            scene_id: data.sceneId,
            visual_description: visualDescription,
            order_index: insertAt,
            status: 'draft',
        })
        .select('id, order_index')
        .single()

    if (error) throw new Error(`Failed to create shot: ${error.message}`)
    if (!shot) throw new Error('No data returned from shot insert')

    revalidatePath(`/projects/${data.projectId}`)

    return { id: shot.id, order_index: shot.order_index }
}