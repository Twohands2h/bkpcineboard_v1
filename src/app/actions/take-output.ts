'use server'

import { createClient } from '@/lib/supabase/server'

// ===================================================
// TAKE OUTPUT — Server Actions (Step 1B)
// ===================================================
// Set or clear the output video node for a Take.
// output_video_node_id is a canvas node UUID stored on the takes row.
// No FK, no RPC, no coupling with Approved/FV/Strip.

export async function setTakeOutputVideoAction({
    takeId,
    nodeId,
}: {
    takeId: string
    nodeId: string
}) {
    const supabase = await createClient()
    const { error } = await supabase
        .from('takes')
        .update({ output_video_node_id: nodeId })
        .eq('id', takeId)

    if (error) throw new Error(`setTakeOutputVideo failed: ${error.message}`)
}

export async function clearTakeOutputVideoAction({
    takeId,
}: {
    takeId: string
}) {
    const supabase = await createClient()
    const { error } = await supabase
        .from('takes')
        .update({ output_video_node_id: null })
        .eq('id', takeId)

    if (error) throw new Error(`clearTakeOutputVideo failed: ${error.message}`)
}

export async function getTakeOutputVideoAction({
    takeId,
}: {
    takeId: string
}): Promise<string | null> {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('takes')
        .select('output_video_node_id')
        .eq('id', takeId)
        .single()

    if (error) return null
    return data?.output_video_node_id ?? null
}