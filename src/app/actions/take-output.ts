'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function setTakeOutputVideo(takeId: string, nodeId: string, videoSrc: string) {
    const supabase = await createClient()
    const { error } = await supabase
        .from('takes')
        .update({ output_video_node_id: nodeId, output_video_src: videoSrc })
        .eq('id', takeId)
    if (error) throw new Error(`setTakeOutputVideo failed: ${error.message}`)
}

export async function clearTakeOutputVideo(takeId: string) {
    const supabase = await createClient()
    const { error } = await supabase
        .from('takes')
        .update({ output_video_node_id: null, output_video_src: null })
        .eq('id', takeId)
    if (error) throw new Error(`clearTakeOutputVideo failed: ${error.message}`)
}