'use server'

import { createClient } from '@/lib/supabase/server'

export async function setShotOutputVideo(shotId: string, nodeId: string, takeId: string) {
    const supabase = await createClient()

    // Guard: verify takeId belongs to this shot
    const { data: take } = await supabase
        .from('takes')
        .select('shot_id')
        .eq('id', takeId)
        .single()
    if (!take || take.shot_id !== shotId) {
        throw new Error(`setShotOutputVideo: take ${takeId} does not belong to shot ${shotId}`)
    }

    // Resolve videoSrc server-side from latest take snapshot
    const { data: snapshot } = await supabase
        .from('take_snapshots')
        .select('payload')
        .eq('take_id', takeId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

    let videoSrc = ''
    if (snapshot?.payload) {
        const raw = snapshot.payload as any
        const nodes = Array.isArray(raw) ? raw : (raw.nodes ?? [])
        const node = nodes.find((n: any) => n.id === nodeId && n.type === 'video')
        if (node?.data) {
            const d = node.data as any
            // Prefer storage_path → getPublicUrl (canonical, never stale)
            if (d.storage_path) {
                const bucket = d.bucket || 'take-videos'
                const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(d.storage_path)
                videoSrc = urlData?.publicUrl ?? ''
            } else if (d.src && typeof d.src === 'string') {
                videoSrc = d.src
            }
            // Only accept http/https URLs
            if (!videoSrc.startsWith('https://') && !videoSrc.startsWith('http://')) {
                videoSrc = ''
            }
        }
    }

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