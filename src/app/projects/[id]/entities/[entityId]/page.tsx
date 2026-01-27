import { getEntity } from '@/lib/db/queries/entities'
import { getProject } from '@/lib/db/queries/projects'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { DeleteEntityButton } from './_components/delete-entity-button'

type Props = {
    params: { id: string; entityId: string }
}

const TYPE_LABELS = {
    character: 'Character',
    environment: 'Environment',
    asset: 'Asset',
} as const

export default async function EntityDetailPage({ params }: Props) {
    const { id: projectId, entityId } = params

    const [project, entity] = await Promise.all([
        getProject(projectId),
        getEntity(entityId),
    ])

    if (!project || !entity) {
        notFound()
    }

    return (
        <div className="container mx-auto py-10 px-4 max-w-4xl">
            {/* Header */}
            <div className="mb-8">
                <Link
                    href={`/projects/${projectId}/entities`}
                    className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block"
                >
                    ← Back to Project Memory
                </Link>
                <div className="flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <h1 className="text-3xl font-bold">{entity.name}</h1>
                            <span className="text-sm px-2 py-1 bg-muted rounded-md">
                                {TYPE_LABELS[entity.type as keyof typeof TYPE_LABELS]}
                            </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            @{entity.slug} · Created{' '}
                            {new Date(entity.created_at).toLocaleDateString()}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" asChild>
                            <Link href={`/projects/${projectId}/entities/${entityId}/edit`}>
                                Edit
                            </Link>
                        </Button>
                        <DeleteEntityButton
                            entityId={entityId}
                            projectId={projectId}
                            entityName={entity.name}
                        />
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="space-y-6">
                {/* Description */}
                {entity.description && (
                    <div className="border rounded-lg p-4">
                        <h2 className="text-sm font-semibold text-muted-foreground mb-2">
                            DESCRIPTION
                        </h2>
                        <p>{entity.description}</p>
                    </div>
                )}

                {/* Master Prompt */}
                <div className="border rounded-lg p-4">
                    <h2 className="text-sm font-semibold text-muted-foreground mb-2">
                        MASTER PROMPT
                    </h2>
                    {entity.master_prompt ? (
                        <p className="whitespace-pre-wrap">{entity.master_prompt}</p>
                    ) : (
                        <p className="text-muted-foreground italic">
                            No master prompt defined yet. Edit to add semantic memory for this
                            entity.
                        </p>
                    )}
                </div>

                {/* Metadata */}
                <div className="border rounded-lg p-4">
                    <h2 className="text-sm font-semibold text-muted-foreground mb-2">
                        METADATA
                    </h2>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="text-muted-foreground">Type:</span>{' '}
                            <span className="capitalize">{entity.type}</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground">Reference:</span> @
                            {entity.slug}
                        </div>
                        <div>
                            <span className="text-muted-foreground">Created:</span>{' '}
                            {new Date(entity.created_at).toLocaleString()}
                        </div>
                        <div>
                            <span className="text-muted-foreground">Updated:</span>{' '}
                            {new Date(entity.updated_at).toLocaleString()}
                        </div>
                    </div>
                </div>

                {/* Future: Shotlist References Placeholder */}
                <div className="border rounded-lg p-4 opacity-50">
                    <h2 className="text-sm font-semibold text-muted-foreground mb-2">
                        APPEARS IN SHOTS
                    </h2>
                    <p className="text-sm text-muted-foreground italic">
                        Shotlist integration coming soon. This entity will be linkable via @
                        {entity.slug}
                    </p>
                </div>
            </div>
        </div>
    )
}