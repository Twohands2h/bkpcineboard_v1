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
  outputVideoSrc?: string | null
  onPreviewFV?: () => void
  onPreviewOutput?: () => void
  onDownloadFV?: () => void
  onDownloadOutput?: () => void
}

export function ShotHeader({ shot, projectId, finalVisual, onUndoFinalVisual, approvedTakeIndex, onApprovedTakeClick, outputVideoSrc, onPreviewFV, onPreviewOutput, onDownloadFV, onDownloadOutput }: ShotHeaderProps) {
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

        {/* Inline status indicator — Approved Take only */}
        {approvedTakeIndex != null && onApprovedTakeClick && (
          <span className="inline-flex items-center gap-2">
            <span className="text-zinc-600">·</span>
            <span
              onClick={onApprovedTakeClick}
              className="text-zinc-300 hover:text-zinc-100 cursor-pointer transition-colors"
              title="Approved take"
            >
              T{approvedTakeIndex}
            </span>
          </span>
        )}
      </nav>

      {/* Contenuto: FV slot (left) + description + Output slot (right) */}
      <div className="flex items-center gap-3">
        {/* FV slot — always present, 16:9 */}
        <div
          className={`shrink-0 h-12 aspect-video rounded-lg overflow-hidden border ${finalVisual?.src ? 'border-emerald-600/50 bg-zinc-800' : 'border-zinc-700/50 bg-white/5'}${finalVisual?.src && onPreviewFV ? ' cursor-pointer' : ''}`}
          onClick={finalVisual?.src ? onPreviewFV : undefined}
          title={finalVisual?.src && onPreviewFV ? 'Preview Final Visual' : undefined}
        >
          {finalVisual?.src && (
            <img
              src={finalVisual.src}
              alt={`Final Visual S${finalVisual.selectionNumber}`}
              className="w-full h-full object-cover"
            />
          )}
        </div>
        {finalVisual && finalVisual.src && onUndoFinalVisual && (
          <button
            onClick={onUndoFinalVisual}
            className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-600 hover:border-zinc-400 text-zinc-400 hover:text-zinc-200 text-[9px] rounded transition-colors cursor-pointer shrink-0"
            title="Revert Final Visual"
          >↩ Undo</button>
        )}
        {finalVisual && finalVisual.src && onDownloadFV && (
          <button
            onClick={onDownloadFV}
            className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-600 hover:border-zinc-400 text-zinc-400 hover:text-zinc-200 text-[9px] rounded transition-colors cursor-pointer shrink-0"
            title="Download Final Visual (original)"
          >↓</button>
        )}

        <h1 className="text-lg font-semibold text-zinc-100 flex-1 min-w-0">
          {shot.visual_description.slice(0, 80) || 'No description'}
          {shot.visual_description.length > 80 && '...'}
        </h1>

        {/* Output slot — always present, 16:9 */}
        <div
          className={`shrink-0 h-12 aspect-video rounded-lg overflow-hidden border ${outputVideoSrc ? 'border-emerald-600/50 bg-zinc-800' : 'border-zinc-700/50 bg-white/5'}${outputVideoSrc && onPreviewOutput ? ' cursor-pointer' : ''}`}
          onClick={outputVideoSrc ? onPreviewOutput : undefined}
          title={outputVideoSrc && onPreviewOutput ? 'Preview Output Video' : undefined}
        >
          {outputVideoSrc && (
            <video
              src={outputVideoSrc}
              preload="metadata"
              muted
              className="w-full h-full object-cover"
            />
          )}
        </div>
        {outputVideoSrc && onDownloadOutput && (
          <button
            onClick={onDownloadOutput}
            className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-600 hover:border-zinc-400 text-zinc-400 hover:text-zinc-200 text-[9px] rounded transition-colors cursor-pointer shrink-0"
            title="Download Output Video (original)"
          >↓</button>
        )}
      </div>

      {shot.technical_notes && (
        <p className="mt-2 text-sm text-zinc-400">
          {shot.technical_notes}
        </p>
      )}
    </div>
  )
}