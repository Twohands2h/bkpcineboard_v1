'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createShotAction(data: {
    projectId: string
    sceneId: string
    name: string
    tag?: string
}): Promise<{ id: string; order_index: number }> {
    const supabase = await createClient()

    // Determine next order_index (end of scene)
    const { data: existing, error: fetchError } = await supabase
        .from('shots')
        .select('order_index')
        .eq('scene_id', data.sceneId)
        .order('order_index', { ascending: false })
        .limit(1)

    if (fetchError) throw new Error(`Failed to fetch shots: ${fetchError.message}`)

    const nextIndex = existing && existing.length > 0 ? existing[0].order_index + 1 : 0

    const visualDescription = data.tag
        ? `${data.name} [${data.tag}]`
        : data.name

    const { data: shot, error } = await supabase
        .from('shots')
        .insert({
            project_id: data.projectId,
            scene_id: data.sceneId,
            visual_description: visualDescription,
            order_index: nextIndex,
            status: 'draft',
        })
        .select('id, order_index')
        .single()

    if (error) throw new Error(`Failed to create shot: ${error.message}`)
    if (!shot) throw new Error('No data returned from shot insert')

    revalidatePath(`/projects/${data.projectId}`)

    return { id: shot.id, order_index: shot.order_index }
}