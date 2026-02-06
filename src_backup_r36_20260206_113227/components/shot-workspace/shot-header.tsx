import { Database } from '@/lib/db/schema'

type Shot = Database['public']['Tables']['shots']['Row']

interface ShotHeaderProps {
  shot: Shot
}

export function ShotHeader({ shot }: ShotHeaderProps) {
  return (
    <div className="border-b border-zinc-800 bg-zinc-900 px-6 py-4 shrink-0">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <span>Shot #{shot.order_index}</span>
        </div>
        <div className="h-4 w-px bg-zinc-700" />
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