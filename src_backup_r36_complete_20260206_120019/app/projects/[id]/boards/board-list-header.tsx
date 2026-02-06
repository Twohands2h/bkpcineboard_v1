'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CreateBoardDialog } from '@/components/boards/create-board-dialog'

interface BoardListHeaderProps {
  projectId: string
  projectTitle?: string
}

/**
 * BoardListHeader - Header con navigazione e bottone create
 * 
 * Boards è la landing page del progetto.
 * Back torna alla lista progetti.
 * Settings link per accedere alle impostazioni progetto.
 */
export function BoardListHeader({ projectId, projectTitle }: BoardListHeaderProps) {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link
            href="/projects"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Projects
          </Link>
          <span className="text-gray-300">|</span>
          <h1 className="text-2xl font-semibold text-gray-900">
            {projectTitle || 'Boards'}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/projects/${projectId}/settings`}
            className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
          >
            Settings
          </Link>
          <button
            onClick={() => setDialogOpen(true)}
            className="px-4 py-2 text-sm bg-gray-900 text-white rounded hover:bg-gray-800"
          >
            + New Board
          </button>
        </div>
      </div>

      <CreateBoardDialog
        projectId={projectId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  )
}
