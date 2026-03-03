'use server'

import { createClient } from '@/lib/supabase/server'

// ── Types ──

interface SnapshotRow {
    id: string
    take_id: string
    payload: { nodes: any[]; edges: any[] }
}

export interface EntityRefUsage {
    totalRefs: number
    affectedTakes: number
    affectedTakeIds: string[]
}

// ── Count: scan project, return targeted take list ──

export async function countEntityRefsInProjectAction(
    projectId: string,
    entityId: string
): Promise<EntityRefUsage> {
    const supabase = await createClient()

    // Step 1: get shot IDs for project
    const { data: shots, error: shotsErr } = await supabase
        .from('shots')
        .select('id')
        .eq('project_id', projectId)

    if (shotsErr || !shots || shots.length === 0) {
        console.error('[entity-ref-ops] shots query error or empty:', shotsErr, 'projectId:', projectId)
        return { totalRefs: 0, affectedTakes: 0, affectedTakeIds: [] }
    }

    const shotIds = shots.map(s => s.id)

    // Step 2: get takes for those shots
    const { data: takes, error: takesErr } = await supabase
        .from('takes')
        .select('id')
        .in('shot_id', shotIds)

    if (takesErr || !takes) {
        console.error('[entity-ref-ops] takes query error:', takesErr)
        return { totalRefs: 0, affectedTakes: 0, affectedTakeIds: [] }
    }

    console.log(`[entity-ref-ops] count: ${shots.length} shots, ${takes.length} takes for project ${projectId}`)

    let totalRefs = 0
    const affectedTakeIds: string[] = []

    for (const take of takes) {
        const snapshot = await getLatestSnapshot(supabase, take.id)
        if (!snapshot?.payload?.nodes) continue

        const count = snapshot.payload.nodes.filter(
            (n: any) => n.type === 'entity_ref' && n.data?.entity_id === entityId
        ).length

        if (count > 0) {
            totalRefs += count
            affectedTakeIds.push(take.id)
            console.log(`[entity-ref-ops] found ${count} refs in take ${take.id}`)
        }
    }

    console.log(`[entity-ref-ops] total: ${totalRefs} refs across ${affectedTakeIds.length} takes for entity ${entityId}`)
    return { totalRefs, affectedTakes: affectedTakeIds.length, affectedTakeIds }
}

// ── Delete cascade: remove entity row + entity_ref nodes from affected takes only ──

export async function deleteEntityCascadeAction(
    entityId: string,
    affectedTakeIds: string[]
): Promise<{ success: boolean; removedRefs: number }> {
    const supabase = await createClient()
    let removedRefs = 0

    // 1. Patch only affected takes
    for (const takeId of affectedTakeIds) {
        const snapshot = await getLatestSnapshot(supabase, takeId)
        if (!snapshot?.payload?.nodes) continue

        const removedNodeIds = new Set<string>()
        const filteredNodes = snapshot.payload.nodes.filter((n: any) => {
            if (n.type === 'entity_ref' && n.data?.entity_id === entityId) {
                removedNodeIds.add(n.id)
                return false
            }
            return true
        })

        if (removedNodeIds.size === 0) continue
        removedRefs += removedNodeIds.size

        // Remove edges connected to removed nodes
        const filteredEdges = (snapshot.payload.edges ?? []).filter(
            (e: any) => !removedNodeIds.has(e.from) && !removedNodeIds.has(e.to)
        )

        await saveUpdatedSnapshot(supabase, snapshot.id, {
            nodes: filteredNodes,
            edges: filteredEdges,
        })
    }

    // 2. Delete entity row
    const { error } = await supabase
        .from('entities')
        .delete()
        .eq('id', entityId)

    if (error) {
        console.error('[entity-ref-ops] delete entity error:', error)
        return { success: false, removedRefs }
    }

    return { success: true, removedRefs }
}

// ── Replace: patch only entity_id in entity_ref nodes across affected takes ──
// Source entity A is NOT deleted — remains in library.
// Only entity_id is patched; name/type are rendered live via entity cache.

export async function replaceEntityRefsAction(
    fromEntityId: string,
    toEntityId: string,
    affectedTakeIds: string[]
): Promise<{ success: boolean; replacedRefs: number }> {
    const supabase = await createClient()
    let replacedRefs = 0

    for (const takeId of affectedTakeIds) {
        const snapshot = await getLatestSnapshot(supabase, takeId)
        if (!snapshot?.payload?.nodes) continue

        let changed = false
        const patchedNodes = snapshot.payload.nodes.map((n: any) => {
            if (n.type === 'entity_ref' && n.data?.entity_id === fromEntityId) {
                changed = true
                replacedRefs++
                return {
                    ...n,
                    data: {
                        ...n.data,
                        entity_id: toEntityId,
                    },
                }
            }
            return n
        })

        if (changed) {
            await saveUpdatedSnapshot(supabase, snapshot.id, {
                nodes: patchedNodes,
                edges: snapshot.payload.edges ?? [],
            })
        }
    }

    return { success: true, replacedRefs }
}

// ── Internal helpers ──

async function getLatestSnapshot(supabase: any, takeId: string): Promise<SnapshotRow | null> {
    const { data, error } = await supabase
        .from('take_snapshots')
        .select('id, take_id, payload')
        .eq('take_id', takeId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

    if (error || !data) return null

    // Normalize payload: might be raw CanvasNode[] (legacy) or { nodes, edges }
    const raw = data.payload as any
    if (Array.isArray(raw)) {
        return { id: data.id, take_id: data.take_id, payload: { nodes: raw, edges: [] } }
    }
    return { id: data.id, take_id: data.take_id, payload: { nodes: raw?.nodes ?? [], edges: raw?.edges ?? [] } }
}

async function saveUpdatedSnapshot(supabase: any, snapshotId: string, payload: any): Promise<void> {
    const { error } = await supabase
        .from('take_snapshots')
        .update({ payload })
        .eq('id', snapshotId)

    if (error) {
        console.error('[entity-ref-ops] snapshot update error:', error)
    }
}