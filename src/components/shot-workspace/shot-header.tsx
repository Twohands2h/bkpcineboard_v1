import Link from 'next/link'
import { Database } from '@/lib/db/schema'

type Shot = Database['public']['Tables']['shots']['Row']

interface FinalVisualData {
  selectionId: string
  src: string
  storagePath: string
  selectionNumber: number
}

interface ShotHeaderProps {
  shot: Shot
  projectId: string
  finalVisual?: FinalVisualData | null
  onUndoFinalVisual?: () => void
  approvedTakeIndex?: number | null
  onApprovedTakeClick?: () => void
  hasFinalVisual?: boolean
  hasOutput?: boolean
}

export function ShotHeader({ shot, projectId, finalVisual, onUndoFinalVisual, approvedTakeIndex, onApprovedTakeClick, hasFinalVisual, hasOutput }: ShotHeaderProps) {
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

        {/* DECIDED badge — display only, no CTA */}
        {shot.approved_take_id && (
          <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase text-emerald-500 bg-emerald-500/10 rounded">
            Decided
          </span>
        )}

        {/* Inline status indicators — only render what exists */}
        {(() => {
          const items: React.ReactNode[] = []

          if (approvedTakeIndex != null && onApprovedTakeClick) {
            items.push(
              <span
                key="approved"
                onClick={onApprovedTakeClick}
                className="text-zinc-300 hover:text-zinc-100 cursor-pointer transition-colors"
                title="Approved take"
              >
                T{approvedTakeIndex}
              </span>
            )
          }

          if (hasFinalVisual) {
            items.push(
              <span key="fv" className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Final Visual" />
            )
          }

          if (hasOutput) {
            items.push(
              <span key="out" className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Output" />
            )
          }

          if (items.length === 0) return null

          return items.map((item, i) => (
            <span key={i} className="inline-flex items-center gap-2">
              <span className="text-zinc-600">·</span>
              {item}
            </span>
          ))
        })()}
      </nav>

      {/* Contenuto + Final Visual thumbnail */}
      <div className="flex items-center gap-3">
        {finalVisual && finalVisual.src && (
          <div className="shrink-0 h-12 max-w-[160px] border border-emerald-600/50 bg-zinc-800 overflow-hidden">
            <img
              src={finalVisual.src}
              alt={`Final Visual S${finalVisual.selectionNumber}`}
              className="h-12 w-auto max-w-[160px] object-contain"
            />
          </div>
        )}
        {finalVisual && finalVisual.src && onUndoFinalVisual && (
          <button
            onClick={onUndoFinalVisual}
            className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-600 hover:border-zinc-400 text-zinc-400 hover:text-zinc-200 text-[9px] rounded transition-colors cursor-pointer shrink-0"
            title="Revert Final Visual"
          >↩ Undo</button>
        )}
        {finalVisual && !finalVisual.src && (
          <div className="h-12 w-12 shrink-0 border border-zinc-700 bg-zinc-800 flex items-center justify-center">
            <span className="text-zinc-600 text-[8px]">missing</span>
          </div>
        )}

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