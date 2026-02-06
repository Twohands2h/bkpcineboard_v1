import { getProject } from '@/lib/db/queries/projects'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { DeleteButton } from '../_components/delete-button'

type Props = {
  params: { id: string }
}

/**
 * Project Settings Page
 * 
 * Gestione impostazioni progetto: edit, delete, metadata.
 * Accessibile da Boards → Settings.
 */
export default async function ProjectSettingsPage({ params }: Props) {
  const { id } = params
  const project = await getProject(id)

  if (!project) {
    notFound()
  }

  const durationMinutes = project.duration_seconds
    ? Math.floor(project.duration_seconds / 60)
    : null

  return (
    <div className="container mx-auto py-10 px-4 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <Link
          href={`/projects/${project.id}/boards`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back to Boards
        </Link>
        <div className="flex items-start justify-between mt-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">{project.title}</h1>
            <p className="text-sm text-muted-foreground">Project Settings</p>
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

        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">
            CREATED
          </h3>
          <p className="text-lg">
            {new Date(project.created_at).toLocaleDateString()}
          </p>
        </div>

        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">
            LAST UPDATED
          </h3>
          <p className="text-lg">
            {new Date(project.updated_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Quick Links */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Quick Links</h2>
        
        <Link
          href={`/projects/${project.id}/entities`}
          className="block border rounded-lg p-4 hover:border-primary transition-colors"
        >
          <h3 className="font-medium">Project Memory</h3>
          <p className="text-sm text-muted-foreground">
            Characters, environments, and assets
          </p>
        </Link>

        <Link
          href={`/projects/${project.id}/boards`}
          className="block border rounded-lg p-4 hover:border-primary transition-colors"
        >
          <h3 className="font-medium">Boards</h3>
          <p className="text-sm text-muted-foreground">
            Visual workspaces for your film
          </p>
        </Link>
      </div>
    </div>
  )
}
