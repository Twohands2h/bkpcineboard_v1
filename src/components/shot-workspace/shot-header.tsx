import Link from 'next/link'
import { Database } from '@/lib/db/schema'
type Shot = Database['public']['Tables']['shots']['Row']
interface FinalVisualData {
  src: string
  storagePath: string
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
  fvTakeLabel?: string | null
  outputTakeLabel?: string | null
}

export function ShotHeader({ shot, projectId, finalVisual, onUndoFinalVisual, approvedTakeIndex, onApprovedTakeClick, outputVideoSrc, onPreviewFV, onPreviewOutput, onDownloadFV, onDownloadOutput, fvTakeLabel, outputTakeLabel }: ShotHeaderProps) {
  const desc = shot.visual_description ?? ''
  return (
    <div className="border-b border-zinc-800 bg-zinc-900 px-6 py-3 shrink-0">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-zinc-500 mb-2">
        <Link href="/projects" className="hover:text-zinc-300 transition-colors">Projects</Link>
        <span className="text-zinc-700">/</span>
        <Link href={`/projects/${projectId}`} className="hover:text-zinc-300 transition-colors">Project</Link>
        <span className="text-zinc-700">/</span>
        <span className="text-zinc-400 font-medium">Shot #{shot.order_index}</span>
        {shot.approved_take_id && (
          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 text-[9px] font-semibold tracking-widest uppercase text-emerald-400/80 bg-emerald-500/8 border border-emerald-500/15 rounded">
            Decided
          </span>
        )}
        {approvedTakeIndex != null && onApprovedTakeClick && (
          <span className="inline-flex items-center gap-1.5 ml-1">
            <span className="text-zinc-700">·</span>
            <span onClick={onApprovedTakeClick} className="text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors text-[10px] font-medium" title="Go to approved take">
              T{approvedTakeIndex}
            </span>
          </span>
        )}
      </nav>

      {/* Main row: FV + Description + Output */}
      <div className="flex items-center gap-3">

        {/* FV slot — 16:9, preview-only */}
        <div className="relative group shrink-0">
          <div
            className={`h-12 aspect-video rounded overflow-hidden transition-all ${finalVisual?.src
              ? 'bg-zinc-800 ring-1 ring-emerald-500/30 group-hover:ring-emerald-400/60'
              : 'bg-gradient-to-br from-zinc-800/80 to-zinc-900/80 ring-1 ring-zinc-700/30'
              }${finalVisual?.src && onPreviewFV ? ' cursor-pointer' : ''}`}
            onClick={finalVisual?.src ? onPreviewFV : undefined}
            title={finalVisual?.src ? 'Preview Final Visual' : undefined}
          >
            {finalVisual?.src ? (
              <img src={finalVisual.src} alt="Final Visual" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg className="w-4 h-4 text-zinc-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
              </div>
            )}
          </div>
          {fvTakeLabel && (
            <div className="absolute bottom-0.5 right-0.5 pointer-events-none z-10">
              <span className="text-[7px] font-bold text-zinc-400/70 bg-zinc-900/80 px-0.5 rounded leading-none">{fvTakeLabel}</span>
            </div>
          )}
        </div>

        {/* Undo FV — inline, unchanged */}
        {finalVisual?.src && onUndoFinalVisual && (
          <button onClick={onUndoFinalVisual} className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-600 hover:border-zinc-400 text-zinc-400 hover:text-zinc-200 text-[9px] rounded transition-colors cursor-pointer shrink-0" title="Revert Final Visual">↩ Undo</button>
        )}
        {finalVisual?.src && onDownloadFV && (
          <button onClick={onDownloadFV} className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-600 hover:border-zinc-400 text-zinc-400 hover:text-zinc-200 text-[9px] rounded transition-colors cursor-pointer shrink-0" title="Download Final Visual">↓</button>
        )}

        {/* Description */}
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-zinc-100 leading-snug">
            {desc.slice(0, 80) || 'No description'}
            {desc.length > 80 && '\u2026'}
          </h1>
          {shot.technical_notes && (
            <p className="mt-1 text-xs text-zinc-500 leading-relaxed line-clamp-1">{shot.technical_notes}</p>
          )}
        </div>

        {/* Output slot — 16:9, preview-only, no <video> element */}
        <div className="relative group shrink-0">
          <div
            className={`h-12 aspect-video rounded overflow-hidden transition-all ${outputVideoSrc
              ? 'bg-zinc-800 ring-1 ring-emerald-600/30 group-hover:ring-emerald-500/60'
              : 'bg-gradient-to-br from-zinc-800/80 to-zinc-900/80 ring-1 ring-zinc-700/30'
              }${outputVideoSrc && onPreviewOutput ? ' cursor-pointer' : ''}`}
            onClick={outputVideoSrc ? onPreviewOutput : undefined}
            title={outputVideoSrc ? 'Preview Output Video' : undefined}
          >
            {outputVideoSrc ? (
              <div className="relative w-full h-full bg-zinc-800">
                <video src={outputVideoSrc} muted playsInline preload="metadata" className="w-full h-full object-cover pointer-events-none" />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <svg className="w-4 h-4 text-white/50" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="8,5 19,12 8,19" />
                  </svg>
                </div>
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg className="w-4 h-4 text-zinc-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <polygon points="10,8 16,12 10,16" fill="currentColor" stroke="none" />
                </svg>
              </div>
            )}
          </div>
          {outputTakeLabel && (
            <div className="absolute bottom-0.5 right-0.5 pointer-events-none z-10">
              <span className="text-[7px] font-bold text-zinc-400/70 bg-zinc-900/80 px-0.5 rounded leading-none">{outputTakeLabel}</span>
            </div>
          )}
        </div>
        {outputVideoSrc && onDownloadOutput && (
          <button onClick={onDownloadOutput} className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-600 hover:border-zinc-400 text-zinc-400 hover:text-zinc-200 text-[9px] rounded transition-colors cursor-pointer shrink-0" title="Download Output">↓</button>
        )}

      </div>
    </div>
  )
}