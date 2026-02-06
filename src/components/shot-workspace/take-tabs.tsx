'use client'

// ===================================================
// TAKE TABS — NAVIGAZIONE TRA TAKES (R3.7 v2.0)
// ===================================================
// R3.7 v2.0: Rimossi dirty/history/restore.
// R3.7-005: Aggiunto Duplica Take.

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
  onDuplicate: () => void  // R3.7-005
}

export function TakeTabs({
  takes,
  currentTakeId,
  onTakeChange,
  onNewTake,
  onDuplicate
}: TakeTabsProps) {
  return (
    <nav className="h-10 bg-zinc-900 border-b border-zinc-800 flex items-center px-4 gap-1 shrink-0 overflow-x-auto">
      {takes.map((take) => {
        const isActive = take.id === currentTakeId

        return (
          <button
            key={take.id}
            onClick={() => onTakeChange(take.id)}
            className={`
              px-3 py-1.5 rounded text-sm transition-colors shrink-0
              ${isActive
                ? 'bg-zinc-700 text-zinc-100'
                : 'bg-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }
            `}
          >
            {take.name}
          </button>
        )
      })}

      {/* New Take */}
      <button
        onClick={onNewTake}
        className="px-3 py-1.5 rounded text-sm transition-colors shrink-0 bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
      >
        + New
      </button>

      {/* R3.7-005: Duplica Take */}
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