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

// ── Usage: scan project, return per-shot usage list for "Where used" UI ──

export interface EntityUsageItem {
    shot_id: string
    take_id: string
    ref_count: number
    film_label: string       // canonical: "S02 · Sh12 — Take 03", built server-side
    // kept for backwards compat (inspector still uses these)
    shot_label: string
    scene_label: string
    take_label: string
}

export interface EntityUsageResult {
    count: number            // total entity_ref nodes across project
    usages: EntityUsageItem[]
}

export async function getEntityUsageAction(
    entityId: string,
    projectId: string
): Promise<EntityUsageResult> {
    const supabase = await createClient()

    // Step 1: shots for project (certified minimal select)
    const { data: shots, error: shotsErr } = await supabase
        .from('shots')
        .select('id, scene_id, order_index')
        .eq('project_id', projectId)

    if (shotsErr || !shots || shots.length === 0) return { count: 0, usages: [] }

    const shotIds = shots.map((s: any) => s.id)
    const shotMap = new Map(shots.map((s: any) => [s.id, s]))

    // Step 2: scenes — order_index preferred; fallback to array position if column missing
    const sceneIds = [...new Set(shots.map((s: any) => s.scene_id).filter(Boolean))]
    // Build sceneOrderMap: sceneId → 1-based order number
    const sceneOrderMap = new Map<string, number>()
    {
        const { data: scenesWithOrder, error: sceneOrderErr } = await supabase
            .from('scenes')
            .select('id, order_index')
            .in('id', sceneIds)
        if (!sceneOrderErr && scenesWithOrder) {
            // Check if order_index is actually populated (not null on all rows)
            const hasOrderIndex = scenesWithOrder.some((sc: any) => sc.order_index != null)
            if (hasOrderIndex) {
                // Sort by order_index for correct numbering
                const sorted = [...scenesWithOrder].sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
                sorted.forEach((sc: any, i) => sceneOrderMap.set(sc.id, i + 1))
            } else {
                // order_index missing/null: use array position as returned by DB (stable insertion order)
                scenesWithOrder.forEach((sc: any, i) => sceneOrderMap.set(sc.id, i + 1))
            }
        } else {
            // Column may not exist — fallback: fetch id only, use array position
            const { data: scenesIdOnly } = await supabase
                .from('scenes')
                .select('id')
                .in('id', sceneIds)
            ;(scenesIdOnly ?? []).forEach((sc: any, i) => sceneOrderMap.set(sc.id, i + 1))
        }
    }

    // Step 3: takes — minimal certified select
    const { data: takes, error: takesErr } = await supabase
        .from('takes')
        .select('id, shot_id')
        .in('shot_id', shotIds)

    if (takesErr || !takes) return { count: 0, usages: [] }

    // Step 4: scan snapshots
    const usages: EntityUsageItem[] = []

    for (const take of takes) {
        const snapshot = await getLatestSnapshot(supabase, take.id)
        if (!snapshot?.payload?.nodes) continue

        const refs = snapshot.payload.nodes.filter(
            (n: any) => n.type === 'entity_ref' && n.data?.entity_id === entityId
        )
        if (refs.length === 0) continue

        usages.push({
            shot_id: take.shot_id ?? '',
            take_id: take.id,
            ref_count: refs.length,
            film_label: '',
            shot_label: '',
            scene_label: '',
            take_label: '',
        })
    }

    const count = usages.length

    // Step 5: enrich film_label — best-effort, never blocks count/navigation
    if (usages.length > 0) {
        // take_number: certified real column (confirmed via select *)
        const { data: takeMeta } = await supabase
            .from('takes')
            .select('id, take_number')
            .in('id', usages.map(u => u.take_id))
        const takeMetaMap = new Map((takeMeta ?? []).map((t: any) => [t.id, t]))

        const pad = (n: number) => String(n).padStart(2, '0')

        for (let i = 0; i < usages.length; i++) {
            const shot = shotMap.get(usages[i].shot_id)
            // shot.order_index: certified (Shot interface + used in strip prefix)
            const shotN = shot?.order_index != null ? shot.order_index + 1 : null
            const sceneN = shot?.scene_id ? (sceneOrderMap.get(shot.scene_id) ?? null) : null
            // take_number: certified real DB column
            const takeN = takeMetaMap.get(usages[i].take_id)?.take_number ?? null

            const sPart  = sceneN != null ? `S${pad(sceneN)}`         : 'S??'
            const shPart = shotN  != null ? `Sh${pad(shotN)}`         : 'Sh??'
            const tPart  = takeN  != null ? `Take ${pad(takeN)}`      : 'Take ?'

            usages[i].film_label  = `${sPart} · ${shPart} — ${tPart}`
            usages[i].shot_label  = shotN  != null ? `Shot #${shotN}` : usages[i].shot_id.slice(-6)
            usages[i].scene_label = sceneN != null ? `Scene ${sceneN}` : ''
            usages[i].take_label  = takeN  != null ? `Take ${takeN}`   : usages[i].take_id.slice(-6)
        }
    }

    return { count, usages }
}

// ── Usage counts: single project scan → { [entityId]: distinctTakeCount } ──
// Called once by Entity Library to show "Used N" on all rows without N round trips.

export async function getEntityUsageCountsAction(
    projectId: string
): Promise<Record<string, number>> {
    const supabase = await createClient()

    // Step 1: shot IDs for project
    const { data: shots, error: shotsErr } = await supabase
        .from('shots')
        .select('id')
        .eq('project_id', projectId)

    if (shotsErr || !shots || shots.length === 0) return {}

    const shotIds = shots.map((s: any) => s.id)

    // Step 2: take IDs for those shots
    const { data: takes, error: takesErr } = await supabase
        .from('takes')
        .select('id')
        .in('shot_id', shotIds)

    if (takesErr || !takes || takes.length === 0) return {}

    // Step 3: single pass over all snapshots — accumulate per-entity distinct take sets
    const takeSets: Record<string, Set<string>> = {}

    for (const take of takes) {
        const snapshot = await getLatestSnapshot(supabase, take.id)
        if (!snapshot?.payload?.nodes) continue

        for (const node of snapshot.payload.nodes) {
            if (node.type !== 'entity_ref') continue
            const eid = node.data?.entity_id
            if (!eid) continue
            if (!takeSets[eid]) takeSets[eid] = new Set()
            takeSets[eid].add(take.id)
        }
    }

    // Convert sets to counts
    const counts: Record<string, number> = {}
    for (const [eid, set] of Object.entries(takeSets)) {
        counts[eid] = set.size
    }
    return counts
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