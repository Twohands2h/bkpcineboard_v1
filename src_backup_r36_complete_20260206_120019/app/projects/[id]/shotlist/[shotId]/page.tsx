import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getProject } from '@/lib/db/queries/projects'
import { getShot } from '@/lib/db/queries/shots'
import { getEntitiesByProject } from '@/lib/db/queries/entities'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Pencil } from 'lucide-react'
import { DeleteShotButton } from '@/components/shots/delete-shot-button'

interface PageProps {
    params: { id: string; shotId: string }
}

const statusColors: Record<string, string> = {
    planning: 'bg-slate-500',
    in_progress: 'bg-blue-500',
    review: 'bg-yellow-500',
    done: 'bg-green-500',
}

const statusLabels: Record<string, string> = {
    planning: 'Planning',
    in_progress: 'In Progress',
    review: 'Review',
    done: 'Done',
}

export default async function ShotDetailPage({ params }: PageProps) {
    const { id: projectId, shotId } = params

    const project = await getProject(projectId)
    if (!project) notFound()

    const shot = await getShot(shotId)
    if (!shot) notFound()

    const entities = await getEntitiesByProject(projectId)
    const entityRefs = (shot.entity_references as Array<{ slug: string; role?: string; context_note?: string }>) || []

    // Map entity slugs to full entity data
    const referencedEntities = entityRefs.map((ref) => {
        const entity = entities.find((e) => e.slug === ref.slug)
        return { ...ref, entity }
    })

    return (
        <div className="container mx-auto py-8 px-4 max-w-2xl">
            {/* Navigation */}
            <Link
                href={`/projects/${projectId}/shotlist`}
                className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
            >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Shotlist
            </Link>

            {/* Header */}
            <div className="flex items-start justify-between mb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <span className="font-mono text-lg font-bold bg-muted px-3 py-1 rounded">
                            {shot.shot_number}
                        </span>
                        {shot.shot_type && (
                            <span className="text-sm text-muted-foreground uppercase">
                                {shot.shot_type}
                            </span>
                        )}
                        <Badge className={statusColors[shot.status]}>
                            {statusLabels[shot.status]}
                        </Badge>
                    </div>
                    {shot.title && <h1 className="text-3xl font-bold">{shot.title}</h1>}
                </div>

                <div className="flex gap-2">
                    <Link href={`/projects/${projectId}/shotlist/${shotId}/edit`}>
                        <Button variant="outline" size="sm">
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit
                        </Button>
                    </Link>
                    <DeleteShotButton shotId={shotId} projectId={projectId} />
                </div>
            </div>

            {/* Description */}
            {shot.description && (
                <section className="mb-8">
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        Description
                    </h2>
                    <p className="text-foreground whitespace-pre-wrap">{shot.description}</p>
                </section>
            )}

            {/* Entity References */}
            {referencedEntities.length > 0 && (
                <section className="mb-8">
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                        Entities in this Shot
                    </h2>
                    <div className="space-y-3">
                        {referencedEntities.map((ref, idx) => (
                            <div
                                key={idx}
                                className="border rounded-lg p-4 bg-accent/30"
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="font-semibold text-primary">@{ref.slug}</span>
                                    {ref.role && (
                                        <span className="text-xs bg-muted px-2 py-0.5 rounded">
                                            {ref.role}
                                        </span>
                                    )}
                                    {ref.entity && (
                                        <Link
                                            href={`/projects/${projectId}/entities/${ref.entity.id}`}
                                            className="text-xs text-muted-foreground hover:text-primary ml-auto"
                                        >
                                            View Entity →
                                        </Link>
                                    )}
                                </div>
                                {ref.context_note && (
                                    <p className="text-sm text-muted-foreground">{ref.context_note}</p>
                                )}
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Metadata */}
            <section className="text-sm text-muted-foreground border-t pt-6">
                <p>Created: {new Date(shot.created_at).toLocaleDateString()}</p>
                <p>Updated: {new Date(shot.updated_at).toLocaleDateString()}</p>
            </section>
        </div>
    )
}