import { getProject } from '@/lib/db/queries/projects'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { DeleteButton } from './_components/delete-button'

type Props = {
    params: { id: string }
}

export default async function ProjectDetailPage({ params }: Props) {
    const { id } = params
    const project = await getProject(id)

    if (!project) {
        notFound()
    }

    // Converti secondi → minuti per display
    const durationMinutes = project.duration_seconds
        ? Math.floor(project.duration_seconds / 60)
        : null

    return (
        <div className="container mx-auto py-10 px-4 max-w-4xl">
            {/* Header */}
            <div className="mb-8">
                <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="block p-6 border rounded-lg hover:border-primary transition-colors"
                >
                    ← Back to Projects
                </Link>
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-3xl font-bold mb-2">{project.title}</h1>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="capitalize">{project.status}</span>
                            {durationMinutes && <span>{durationMinutes} minutes</span>}
                            <span>
                                Created {new Date(project.created_at).toLocaleDateString()}
                            </span>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" asChild>
                            <Link
                                href={`/projects/${project.id}/edit?title=${encodeURIComponent(project.title)}&logline=${encodeURIComponent(project.logline || '')}&duration=${project.duration_seconds || ''}&status=${project.status}`}
                            >
                                Edit
                            </Link>
                        </Button>
                        <DeleteButton projectId={project.id} projectTitle={project.title} />
                    </div>
                </div>
            </div>

            {/* Logline */}
            {project.logline && (
                <div className="mb-8">
                    <h2 className="text-sm font-semibold text-muted-foreground mb-2">
                        LOGLINE
                    </h2>
                    <p className="text-lg">{project.logline}</p>
                </div>
            )}

            {/* Project Info */}
            <div className="grid gap-6 md:grid-cols-2 mb-8">
                <div className="border rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2">
                        STATUS
                    </h3>
                    <p className="text-lg capitalize">{project.status}</p>
                </div>

                <div className="border rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2">
                        DURATION
                    </h3>
                    <p className="text-lg">
                        {durationMinutes ? `${durationMinutes} minutes` : 'Not set'}
                    </p>
                </div>
            </div>

            {/* Placeholders for future sections */}
            <div className="space-y-6">
                {/* Entities placeholder */}
                <div className="border rounded-lg p-6">
                    <h2 className="text-lg font-semibold mb-2">Entities</h2>
                    <p className="text-sm text-muted-foreground">
                        Characters, environments, and assets will appear here.
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                        Coming in Week 4+
                    </p>
                </div>

                {/* Shotlist placeholder */}
                <div className="border rounded-lg p-6">
                    <h2 className="text-lg font-semibold mb-2">Shotlist</h2>
                    <p className="text-sm text-muted-foreground">
                        Your film's shot structure will appear here.
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                        Coming in Week 7+
                    </p>
                </div>
            </div>
        </div>
    )
}