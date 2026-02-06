'use client'

import Link from 'next/link'
import { EntityLibraryTrigger } from '@/components/entity-library/entity-library-trigger'

interface ProjectHeaderProps {
  projectId: string
}

/**
 * ProjectHeader
 * 
 * Header globale di progetto, visibile in tutte le viste.
 * Contiene navigazione e trigger Entity Library.
 */
export function ProjectHeader({ projectId }: ProjectHeaderProps) {
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 h-12 flex items-center justify-between">
        {/* Left: Navigation */}
        <div className="flex items-center gap-4">
          <Link
            href="/projects"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Projects
          </Link>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <EntityLibraryTrigger />
        </div>
      </div>
    </header>
  )
}
