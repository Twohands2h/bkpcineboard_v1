import { getEntitiesByProject, countEntitiesByProject } from '@/lib/db/queries/entities'
import { getProject } from '@/lib/db/queries/projects'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

type Props = {
    params: { id: string }
}

// Entity type labels (film-first terminology)
const TYPE_LABELS = {
    character: 'Characters',
    environment: 'Environments',
    asset: 'Assets',
} as const

const TYPE_DESCRIPTIONS = {
    character: 'People, creatures, and animated beings',
    environment: 'Locations, settings, and spaces',
    asset: 'Props, vehicles, objects, and FX elements',
} as const

export default async function EntitiesPage({ params }: Props) {
    const { id: projectId } = params

    // Fetch project and entities
    const [project, entities, count] = await Promise.all([
        getProject(projectId),
        getEntitiesByProject(projectId),
        countEntitiesByProject(projectId),
    ])

    if (!project) {
        notFound()
    }

    // Group entities by type
    const grouped = {
        character: entities.filter((e) => e.type === 'character'),
        environment: entities.filter((e) => e.type === 'environment'),
        asset: entities.filter((e) => e.type === 'asset'),
    }

    const isMaxReached = count >= 5

    return (
        <div className="container mx-auto py-10 px-4 max-w-4xl">
            {/* Header */}
            <div className="mb-8">
                <Link
                    href={`/projects/${projectId}`}
                    className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block"
                >
                    ← Back to {project.title}
                </Link>
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-3xl font-bold mb-2">Project Memory</h1>
                        <p className="text-muted-foreground">
                            {count}/5 entities
                            {isMaxReached && (
                                <span className="text-destructive ml-2">(limit reached)</span>
                            )}
                        </p>
                    </div>
                    <Button asChild disabled={isMaxReached}>
                        <Link
                            href={isMaxReached ? '#' : `/projects/${projectId}/entities/new`}
                            className={isMaxReached ? 'pointer-events-none opacity-50' : ''}
                        >
                            + Add Entity
                        </Link>
                    </Button>
                </div>
            </div>

            {/* Entity Groups */}
            <div className="space-y-8">
                {(['character', 'environment', 'asset'] as const).map((type) => (
                    <div key={type} className="border rounded-lg p-6">
                        <div className="mb-4">
                            <h2 className="text-lg font-semibold">{TYPE_LABELS[type]}</h2>
                            <p className="text-sm text-muted-foreground">
                                {TYPE_DESCRIPTIONS[type]}
                            </p>
                        </div>

                        {grouped[type].length === 0 ? (
                            <p className="text-sm text-muted-foreground italic">
                                No {TYPE_LABELS[type].toLowerCase()} yet
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {grouped[type].map((entity) => (
                                    <Link
                                        key={entity.id}
                                        href={`/projects/${projectId}/entities/${entity.id}`}
                                        className="block p-4 border rounded-md hover:border-primary transition-colors"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="font-medium">{entity.name}</h3>
                                                {entity.description && (
                                                    <p className="text-sm text-muted-foreground line-clamp-1">
                                                        {entity.description}
                                                    </p>
                                                )}
                                            </div>
                                            <span className="text-xs text-muted-foreground">
                                                @{entity.slug}
                                            </span>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}