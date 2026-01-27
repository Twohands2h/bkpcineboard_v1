import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getProject } from '@/lib/db/queries/projects'
import { getEntity } from '@/lib/db/queries/entities'
import { getShotlistByProject } from '@/lib/db/queries/shotlists'
import { getShotsByEntity } from '@/lib/db/queries/shots'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Pencil, Film } from 'lucide-react'
import { DeleteEntityButton } from '@/components/entities/delete-entity-button'

interface PageProps {
    params: { id: string; entityId: string }
}

const typeColors: Record<string, string> = {
    character: 'bg-blue-500',
    environment: 'bg-green-500',
    asset: 'bg-purple-500',
}

const typeLabels: Record<string, string> = {
    character: 'Character',
    environment: 'Environment',
    asset: 'Asset',
}

export default async function EntityDetailPage({ params }: PageProps) {
    const { id: projectId, entityId } = params

    const project = await getProject(projectId)
    if (!project) notFound()

    const entity = await getEntity(entityId)
    if (!entity) notFound()

    // Get shots that reference this entity
    const shotlist = await getShotlistByProject(projectId)
    const shotsUsingEntity = shotlist
        ? await getShotsByEntity(shotlist.id, entity.slug)
        : []

    return (
        <div className="container mx-auto py-8 px-4 max-w-2xl">
            {/* Navigation */}
            <Link
                href={`/projects/${projectId}/entities`}
                className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
            >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Entities
            </Link>

            {/* Header */}
            <div className="flex items-start justify-between mb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Badge className={typeColors[entity.type]}>
                            {typeLabels[entity.type]}
                        </Badge>
                        <span className="font-mono text-sm text-muted-foreground">
                            @{entity.slug}
                        </span>
                    </div>
                    <h1 className="text-3xl font-bold">{entity.name}</h1>
                </div>

                <div className="flex gap-2">
                    <Link href={`/projects/${projectId}/entities/${entityId}/edit`}>
                        <Button variant="outline" size="sm">
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit
                        </Button>
                    </Link>
                    <DeleteEntityButton entityId={entityId} projectId={projectId} />
                </div>
            </div>

            {/* Master Prompt */}
            {entity.master_prompt && (
                <section className="mb-8">
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        Master Prompt
                    </h2>
                    <div className="bg-muted/50 rounded-lg p-4">
                        <p className="text-foreground whitespace-pre-wrap font-mono text-sm">
                            {entity.master_prompt}
                        </p>
                    </div>
                </section>
            )}

            {/* Shots Using This Entity */}
            <section className="mb-8">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Used in Shots ({shotsUsingEntity.length})
                </h2>

                {shotsUsingEntity.length === 0 ? (
                    <div className="text-center py-8 border-2 border-dashed rounded-lg">
                        <Film className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">
                            This entity is not used in any shots yet.
                        </p>
                        <Link href={`/projects/${projectId}/shotlist/new`}>
                            <Button variant="link" size="sm" className="mt-2">
                                Create a shot using @{entity.slug}
                            </Button>
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {shotsUsingEntity.map((shot) => {
                            const entityRefs = (shot.entity_references as Array<{ slug: string; role?: string; context_note?: string }>) || []
                            const thisRef = entityRefs.find((ref) => ref.slug === entity.slug)

                            return (
                                <Link
                                    key={shot.id}
                                    href={`/projects/${projectId}/shotlist/${shot.id}`}
                                    className="block"
                                >
                                    <div className="border rounded-lg p-3 hover:border-primary hover:bg-accent/50 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <span className="font-mono text-sm font-bold bg-muted px-2 py-1 rounded">
                                                {shot.shot_number}
                                            </span>
                                            {shot.title && (
                                                <span className="font-medium">{shot.title}</span>
                                            )}
                                            {thisRef?.role && (
                                                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded ml-auto">
                                                    {thisRef.role}
                                                </span>
                                            )}
                                        </div>
                                        {thisRef?.context_note && (
                                            <p className="text-xs text-muted-foreground mt-1 ml-12">
                                                {thisRef.context_note}
                                            </p>
                                        )}
                                    </div>
                                </Link>
                            )
                        })}
                    </div>
                )}
            </section>

            {/* Metadata */}
            <section className="text-sm text-muted-foreground border-t pt-6">
                <p>Created: {new Date(entity.created_at).toLocaleDateString()}</p>
                <p>Updated: {new Date(entity.updated_at).toLocaleDateString()}</p>
            </section>
        </div>
    )
}