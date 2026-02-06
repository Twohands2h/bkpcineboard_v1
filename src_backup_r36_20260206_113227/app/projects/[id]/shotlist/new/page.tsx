import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getProject } from '@/lib/db/queries/projects'
import { getOrCreateShotlist } from "@/lib/db/queries/shots"
import { getEntitiesByProject } from '@/lib/db/queries/entities'
import { ArrowLeft } from 'lucide-react'
import { ShotForm } from '@/components/shots/shot-form'

interface PageProps {
    params: { id: string }
}

export default async function NewShotPage({ params }: PageProps) {
    const { id: projectId } = params

    const project = await getProject(projectId)
    if (!project) notFound()

    // getOrCreate only on explicit shot creation
    const shotlist = await getOrCreateShotlist(projectId)
    const entities = await getEntitiesByProject(projectId)

    return (
        <div className="container mx-auto py-8 px-4 max-w-2xl">
            <Link
                href={`/projects/${projectId}/shotlist`}
                className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
            >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Shotlist
            </Link>

            <h1 className="text-3xl font-bold mb-8">New Shot</h1>

            <ShotForm
                projectId={projectId}
                shotlistId={shotlist.id}
                entities={entities}
            />
        </div>
    )
}