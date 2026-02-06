import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getProject } from '@/lib/db/queries/projects'
import { getShot } from '@/lib/db/queries/shots'
import { getShotsByProject } from "@/lib/db/queries/shots"
import { getEntitiesByProject } from '@/lib/db/queries/entities'
import { ArrowLeft } from 'lucide-react'
import { ShotForm } from '@/components/shots/shot-form'

interface PageProps {
    params: { id: string; shotId: string }
}

export default async function EditShotPage({ params }: PageProps) {
    const { id: projectId, shotId } = params

    const project = await getProject(projectId)
    if (!project) notFound()

    const shot = await getShot(shotId)
    if (!shot) notFound()

    const shotlist = await getShotsByProject(projectId)
    if (!shotlist) notFound()

    const entities = await getEntitiesByProject(projectId)

    return (
        <div className="container mx-auto py-8 px-4 max-w-2xl">
            <Link
                href={`/projects/${projectId}/shotlist/${shotId}`}
                className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
            >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Shot
            </Link>

            <h1 className="text-3xl font-bold mb-8">Edit Shot {shot.shot_number}</h1>

            <ShotForm
                projectId={projectId}
                shotlistId={shotlist.id}
                shot={shot}
                entities={entities}
            />
        </div>
    )
}