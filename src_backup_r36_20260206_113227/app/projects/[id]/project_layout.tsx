import { notFound } from 'next/navigation'
import { getProject } from '@/lib/db/queries/projects'
import { ClipboardProvider } from '@/contexts/clipboard-context'
import { EntityLibraryProvider } from '@/contexts/entity-library-context'
import { EntityLibraryDrawer } from '@/components/entity-library'
import { ProjectHeader } from './_components/project-header'

interface ProjectLayoutProps {
  children: React.ReactNode
  params: { id: string }
}

export default async function ProjectLayout({ children, params }: ProjectLayoutProps) {
  const projectId = params.id

  const project = await getProject(projectId)
  
  if (!project) {
    notFound()
  }

  return (
    <ClipboardProvider>
      <EntityLibraryProvider>
        <div className="h-full flex flex-col">
          <ProjectHeader projectId={projectId} />
          
          <main className="flex-1 min-h-0 overflow-hidden">
            {children}
          </main>
        </div>
        
        <EntityLibraryDrawer projectId={projectId} />
      </EntityLibraryProvider>
    </ClipboardProvider>
  )
}
