import { listProjects } from '@/lib/db/queries/projects'
import Link from 'next/link'

export default async function ProjectsPage() {
    const projects = await listProjects()

    return (
        <div className="container mx-auto py-10 px-4">
            <div className="mb-8">
                <h1 className="text-3xl font-bold mb-2">Projects</h1>
                <p className="text-muted-foreground">
                    Your film projects
                </p>
            </div>

            {projects.length === 0 ? (
                <div className="text-center py-12">
                    <p className="text-muted-foreground mb-4">
                        No projects yet. Create your first film.
                    </p>
                    <Link
                        href="/projects/new"
                        className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    >
                        Create Project
                    </Link>
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {projects.map((project) => (
                        <Link
                            key={project.id}
                            href={`/projects/${project.id}`}
                            className="block p-6 border rounded-lg hover:border-primary transition-colors"
                        >
                            <h3 className="text-xl font-semibold mb-2">{project.title}</h3>
                            {project.logline && (
                                <p className="text-sm text-muted-foreground mb-4">
                                    {project.logline}
                                </p>
                            )}
                            <div className="flex items-center justify-between text-sm">
                                <span className="capitalize text-muted-foreground">
                                    {project.status}
                                </span>
                                {project.duration_seconds && (
                                    <span className="text-muted-foreground">
                                        {Math.floor(project.duration_seconds / 60)}m
                                    </span>
                                )}
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}