import Link from 'next/link'
import { Database } from '@/lib/db/schema'

type Shot = Database['public']['Tables']['shots']['Row']

interface ShotHeaderProps {
  shot: Shot
  projectId: string
}

export function ShotHeader({ shot, projectId }: ShotHeaderProps) {
  return (
    <div className="border-b border-zinc-800 bg-zinc-900 px-6 py-4 shrink-0">
      {/* Breadcrumb minimale */}
      <nav className="flex items-center gap-2 text-sm text-zinc-400 mb-3">
        <Link href="/projects" className="hover:text-zinc-200 transition-colors">
          Projects
        </Link>
        <span>/</span>
        <Link
          href={`/projects/${projectId}`}
          className="hover:text-zinc-200 transition-colors"
        >
          Project
        </Link>
        <span>/</span>
        <span className="text-zinc-300">Shot #{shot.order_index}</span>
      </nav>

      {/* Contenuto esistente */}
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-zinc-100">
          {shot.visual_description.slice(0, 80) || 'No description'}
          {shot.visual_description.length > 80 && '...'}
        </h1>
      </div>

      {shot.technical_notes && (
        <p className="mt-2 text-sm text-zinc-400">
          {shot.technical_notes}
        </p>
      )}
    </div>
  )
}