import { listProjectBoards } from '@/lib/db/queries/boards'
import { getProject } from '@/lib/db/queries/projects'
import { notFound } from 'next/navigation'
import { BoardCard } from '@/components/boards/board-card'
import { BoardListHeader } from './board-list-header'

interface PageProps {
  params: { id: string }
}

/**
 * Board List Page
 * 
 * Landing page per un progetto.
 * Lista tutte le board attive.
 */
export default async function BoardListPage({ params }: PageProps) {
  const { id: projectId } = params
  
  const [boards, project] = await Promise.all([
    listProjectBoards(projectId),
    getProject(projectId)
  ])

  if (!project) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <BoardListHeader 
          projectId={projectId} 
          projectTitle={project.title}
        />

        {/* Board Grid */}
        {boards.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {boards.map((board) => (
              <BoardCard
                key={board.id}
                board={board}
                projectId={projectId}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500">No boards yet.</p>
            <p className="text-sm text-gray-400 mt-1">
              Create your first board to get started.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
