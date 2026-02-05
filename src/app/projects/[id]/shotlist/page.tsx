import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getProject } from '@/lib/db/queries/projects'
import { getShotsByProject } from "@/lib/db/queries/shots"
import { getShotsByShotlist } from '@/lib/db/queries/shots'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Film, ArrowLeft } from 'lucide-react'

interface PageProps {
    params: { id: string }
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

export default async function ShotlistPage({ params }: PageProps) {
    const { id: projectId } = params

    const project = await getProject(projectId)
    if (!project) notFound()

    const shotlist = await getShotsByProject(projectId)

    // If no shotlist exists, show empty state
    if (!shotlist) {
        return (
            <div className="container mx-auto py-8 px-4 max-w-4xl">
                <Link
                    href={`/projects/${projectId}`}
                    className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
                >
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    Back to Project
                </Link>

                <div className="text-center py-16 border-2 border-dashed rounded-lg">
                    <Film className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <h2 className="text-xl font-semibold mb-2">No shotlist yet</h2>
                    <p className="text-muted-foreground mb-6">
                        Create your first shot to start building the narrative.
                    </p>
                    <Link href={`/projects/${projectId}/shotlist/new`}>
                        <Button>
                            <Plus className="w-4 h-4 mr-2" />
                            Create First Shot
                        </Button>
                    </Link>
                </div>
            </div>
        )
    }

    const shots = await getShotsByShotlist(shotlist.id)

    return (
        <div className="container mx-auto py-8 px-4 max-w-4xl">
            {/* Header */}
            <div className="mb-8">
                <Link
                    href={`/projects/${projectId}`}
                    className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
                >
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    Back to Project
                </Link>

                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold">{shotlist.title}</h1>
                        <p className="text-muted-foreground mt-1">
                            {project.title} • {shots.length} shot{shots.length !== 1 ? 's' : ''}
                        </p>
                    </div>

                    <Link href={`/projects/${projectId}/shotlist/new`}>
                        <Button>
                            <Plus className="w-4 h-4 mr-2" />
                            Add Shot
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Shots List */}
            {shots.length === 0 ? (
                <div className="text-center py-16 border-2 border-dashed rounded-lg">
                    <Film className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <h2 className="text-xl font-semibold mb-2">No shots yet</h2>
                    <p className="text-muted-foreground mb-6">
                        Start building your narrative by adding your first shot.
                    </p>
                    <Link href={`/projects/${projectId}/shotlist/new`}>
                        <Button>
                            <Plus className="w-4 h-4 mr-2" />
                            Add First Shot
                        </Button>
                    </Link>
                </div>
            ) : (
                <div className="space-y-3">
                    {shots.map((shot) => {
                        const entityRefs = (shot.entity_references as Array<{ slug: string; role?: string; context_note?: string }>) || []

                        return (
                            <Link
                                key={shot.id}
                                href={`/projects/${projectId}/shotlist/${shot.id}`}
                                className="block"
                            >
                                <div className="border rounded-lg p-4 hover:border-primary hover:bg-accent/50 transition-colors">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 mb-2">
                                                <span className="font-mono text-sm font-bold bg-muted px-2 py-1 rounded">
                                                    {shot.shot_number}
                                                </span>
                                                {shot.shot_type && (
                                                    <span className="text-xs text-muted-foreground uppercase">
                                                        {shot.shot_type}
                                                    </span>
                                                )}
                                                <Badge className={statusColors[shot.status]}>
                                                    {statusLabels[shot.status]}
                                                </Badge>
                                            </div>

                                            {shot.title && (
                                                <h3 className="font-semibold mb-1">{shot.title}</h3>
                                            )}

                                            {shot.description && (
                                                <p className="text-sm text-muted-foreground line-clamp-2">
                                                    {shot.description}
                                                </p>
                                            )}

                                            {entityRefs.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-2">
                                                    {entityRefs.map((ref, idx) => (
                                                        <span
                                                            key={idx}
                                                            className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded"
                                                        >
                                                            @{ref.slug}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        )
                    })}
                </div>
            )}
        </div>
    )
}