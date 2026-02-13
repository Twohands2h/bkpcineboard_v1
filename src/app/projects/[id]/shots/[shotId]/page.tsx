import { notFound } from 'next/navigation'
import { getShotById, listSceneShots } from '@/lib/db/queries/shots'
import { listShotTakes } from '@/lib/db/queries/takes'
import { listProjectScenes } from '@/lib/db/queries/scenes'
import { ShotWorkspaceClient } from '@/components/shot-workspace/shot-workspace-client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Props = {
  params: {
    id: string
    shotId: string
  }
}

export default async function ShotWorkspacePage({ params }: Props) {
  const { id: projectId, shotId } = params

  const shot = await getShotById(shotId)

  if (!shot) {
    notFound()
  }

  if (shot.project_id !== projectId) {
    notFound()
  }

  // Fetch takes from DB (real schema)
  const rawTakes = await listShotTakes(shotId)

  // Sort by created_at
  const sortedRawTakes = [...rawTakes].sort((a, b) => {
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })

  // ✅ ADAPTER: DB schema → Component interface
  const takes = sortedRawTakes.map((take, index) => ({
    id: take.id,
    shot_id: take.shot_id!,
    name: `Take ${index + 1}`,
    order_index: index,
    description: null,
    status: take.status,
    created_at: take.created_at,
    updated_at: take.created_at,
  }))

  // ── Scene + Shot Strip data ──
  const [scenes, currentSceneShots] = await Promise.all([
    listProjectScenes(projectId),
    listSceneShots(shot.scene_id),
  ])

  // For cross-scene nav: get first shot of each scene
  const scenesWithFirstShot = await Promise.all(
    scenes.map(async (scene) => {
      if (scene.id === shot.scene_id) {
        return {
          id: scene.id,
          title: scene.title,
          order_index: scene.order_index,
          firstShotId: currentSceneShots[0]?.id ?? null,
        }
      }
      const otherShots = await listSceneShots(scene.id)
      return {
        id: scene.id,
        title: scene.title,
        order_index: scene.order_index,
        firstShotId: otherShots[0]?.id ?? null,
      }
    })
  )

  // ── Strip thumbnails: batch fetch FV decision_notes ──
  const fvIds = currentSceneShots
    .map(s => s.final_visual_selection_id)
    .filter((id): id is string => id != null)

  let thumbByShotId: Record<string, string | null> = {}

  if (fvIds.length > 0) {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data: notes } = await supabase
      .from('decision_notes')
      .select('id, body')
      .in('id', fvIds)

    // Build id → src map from decision_notes (hardened)
    const srcById: Record<string, string | null> = {}
    for (const note of notes ?? []) {
      try {
        const parsed = typeof note.body === 'string' ? JSON.parse(note.body) : note.body
        if (!parsed || parsed.event !== 'promote_asset') continue
        const src = parsed?.image_snapshot?.src
        srcById[note.id] = typeof src === 'string' && src.length > 0 ? src : null
      } catch {
        srcById[note.id] = null
      }
    }

    // Map shot id → thumbnail src
    for (const s of currentSceneShots) {
      if (s.final_visual_selection_id && srcById[s.final_visual_selection_id]) {
        thumbByShotId[s.id] = srcById[s.final_visual_selection_id]!
      }
    }
  }

  const stripShots = currentSceneShots.map((s) => ({
    id: s.id,
    order_index: s.order_index,
    visual_description: s.visual_description,
    thumbSrc: thumbByShotId[s.id] ?? null,
    status: s.approved_take_id != null
      ? 'DECIDED' as const
      : s.final_visual_selection_id != null
        ? 'HAS_FV' as const
        : 'DEFAULT' as const,
  }))

  return (
    <ShotWorkspaceClient
      shot={shot}
      takes={takes}
      projectId={projectId}
      stripData={{
        scenes: scenesWithFirstShot,
        currentSceneId: shot.scene_id,
        sceneShots: stripShots,
      }}
    />
  )
}