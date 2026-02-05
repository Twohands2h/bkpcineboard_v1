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

  const takes = await listShotTakes(shotId)

  const takesSortedByCreation = [...takes].sort((a, b) => {
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })

  return (
    <ShotWorkspaceClient 
      shot={shot} 
      takes={takesSortedByCreation}
      projectId={projectId}
    />
  )
}
