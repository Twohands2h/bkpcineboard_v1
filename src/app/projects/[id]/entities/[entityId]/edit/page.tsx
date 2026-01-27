import { getEntity } from '@/lib/db/queries/entities'
import { getProject } from '@/lib/db/queries/projects'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { EditEntityForm } from './_components/edit-entity-form'

type Props = {
    params: { id: string; entityId: string }
}

export default async function EditEntityPage({ params }: Props) {
    const { id: projectId, entityId } = params

    // Fetch entity from database (single source of truth)
    const [project, entity] = await Promise.all([
        getProject(projectId),
        getEntity(entityId),
    ])

    if (!project || !entity) {
        notFound()
    }

    return (
        <div className="container mx-auto py-10 px-4 max-w-2xl">
            <div className="mb-8">
                <Link
                    href={`/projects/${projectId}/entities/${entityId}`}
                    className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block"
                >
                    ← Back to Entity
                </Link>
                <h1 className="text-3xl font-bold mb-2">Edit Entity</h1>
                <p className="text-muted-foreground">
                    Update entity details. Type and reference (@slug) cannot be changed.
                </p>
            </div>

            {/* Pass entity data to Client Component form */}
            <EditEntityForm
                entityId={entityId}
                projectId={projectId}
                entity={{
                    name: entity.name,
                    description: entity.description,
                    master_prompt: entity.master_prompt,
                    type: entity.type,
                    slug: entity.slug,
                }}
            />
        </div>
    )
}