'use server'

import { createClient } from '@/lib/supabase/server'

export async function setShotOutputVideo(shotId: string, nodeId: string, videoSrc: string, takeId: string) {
    const supabase = await createClient()
    const { error } = await supabase
        .from('shots')
        .update({
            output_video_node_id: nodeId,
            output_video_src: videoSrc,
            output_take_id: takeId,
        })
        .eq('id', shotId)
    if (error) throw new Error(`setShotOutputVideo failed: ${error.message}`)
}

export async function clearShotOutputVideo(shotId: string) {
    const supabase = await createClient()
    const { error } = await supabase
        .from('shots')
        .update({
            output_video_node_id: null,
            output_video_src: null,
            output_take_id: null,
        })
        .eq('id', shotId)
    if (error) throw new Error(`clearShotOutputVideo failed: ${error.message}`)
}