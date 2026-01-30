import { ClipboardProvider } from '@/contexts/clipboard-context'
import { EntityLibraryProvider } from '@/contexts/entity-library-context'
import { EntityLibraryDrawer } from '@/components/entity-library'
import { ProjectHeader } from './_components/project-header'

interface ProjectLayoutProps {
  children: React.ReactNode
  params: { id: string }
}

/**
 * Project Layout
 * 
 * Providers a livello di progetto:
 * - ClipboardProvider: clipboard persiste tra board
 * - EntityLibraryProvider: drawer Entity Library globale
 * 
 * Cambiando progetto, il layout si rimonta e tutto si resetta.
 */
export default function ProjectLayout({ children, params }: ProjectLayoutProps) {
  return (
    <ClipboardProvider>
      <EntityLibraryProvider>
        {/* Header con trigger Entity Library */}
        <ProjectHeader projectId={params.id} />
        
        {/* Page content */}
        <main>
          {children}
        </main>
        
        {/* Entity Library Drawer (globale, sempre montato) */}
        <EntityLibraryDrawer projectId={params.id} />
      </EntityLibraryProvider>
    </ClipboardProvider>
  )
}
