import { notFound } from 'next/navigation'
import { getShotById } from '@/lib/db/queries/shots'
import { listShotTakes } from '@/lib/db/queries/takes'
import { ShotWorkspaceClient } from '@/components/shot-workspace/shot-workspace-client'

type Props = {
  params: {
    id: string
    shotId: string
  }
}

export const dynamic = 'force-dynamic'

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
    name: `Take ${index + 1}`,           // computed from position
    order_index: index,                  // computed from position
    description: null,                   // default
    status: take.status,
    created_at: take.created_at,
    updated_at: take.created_at,         // fallback to created_at
  }))

  return (
    <ShotWorkspaceClient
      shot={shot}
      takes={takes}
      projectId={projectId}
    />
  )
}