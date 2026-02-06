'use client'

// ===================================================
// TAKE TABS — NAVIGAZIONE TRA TAKES (R3.8-002 v2)
// ===================================================
// ✕ inline su hover del tab. Non eliminabile se unico Take.

interface Take {
  id: string
  shot_id: string
  name: string
  description: string | null
  status: string
  order_index: number
  created_at: string
  updated_at: string
}

interface TakeTabsProps {
  takes: Take[]
  currentTakeId: string | null
  onTakeChange: (takeId: string) => void
  onNewTake: () => void
  onDuplicate: () => void
  onDelete: (takeId: string) => void  // R3.8-002: passa l'id del Take da eliminare
}

export function TakeTabs({
  takes,
  currentTakeId,
  onTakeChange,
  onNewTake,
  onDuplicate,
  onDelete
}: TakeTabsProps) {
  const canDelete = takes.length > 1

  return (
    <nav className="h-10 bg-zinc-900 border-b border-zinc-800 flex items-center px-4 gap-1 shrink-0 overflow-x-auto">
      {takes.map((take) => {
        const isActive = take.id === currentTakeId

        return (
          <div
            key={take.id}
            className={`
              group relative flex items-center gap-1 px-3 py-1.5 rounded text-sm transition-colors shrink-0 cursor-pointer
              ${isActive
                ? 'bg-zinc-700 text-zinc-100'
                : 'bg-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }
            `}
            onClick={() => onTakeChange(take.id)}
          >
            <span>{take.name}</span>

            {/* ✕ visibile solo su hover, solo se eliminabile */}
            {canDelete && (
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(take.id)
                }}
                className="ml-1 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-red-900/50 text-zinc-500 hover:text-red-400 transition-all text-xs"
                title={`Delete ${take.name}`}
              >
                ✕
              </span>
            )}
          </div>
        )
      })}

      {/* New Take */}
      <button
        onClick={onNewTake}
        className="px-3 py-1.5 rounded text-sm transition-colors shrink-0 bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
      >
        + New
      </button>

      {/* Duplica Take */}
      {currentTakeId && (
        <button
          onClick={onDuplicate}
          className="px-3 py-1.5 rounded text-sm transition-colors shrink-0 bg-zinc-800 hover:bg-zinc-700 text-amber-400"
        >
          Duplica
        </button>
      )}
    </nav>
  )
}