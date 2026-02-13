'use client'

// ===================================================
// TAKE TABS — NAVIGAZIONE TRA TAKES (R3.8-002 v4)
// ===================================================
// ✕ inline su hover del tab. Non eliminabile se unico Take.
// v4: Approved Take CTA (✓ approve / ↺ revoke).
//     Dot: emerald (approved) > amber (FV). Props required.

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
  onDelete: (takeId: string) => void
  finalVisualTakeId: string | null
  approvedTakeId: string | null
  onApproveTake: (takeId: string) => void
  onRevokeTake: () => void
}

export function TakeTabs({
  takes,
  currentTakeId,
  onTakeChange,
  onNewTake,
  onDuplicate,
  onDelete,
  finalVisualTakeId,
  approvedTakeId,
  onApproveTake,
  onRevokeTake,
}: TakeTabsProps) {
  const canDelete = takes.length > 1

  return (
    <nav className="h-10 bg-zinc-900 border-b border-zinc-800 flex items-center px-4 gap-1 shrink-0 overflow-x-auto">
      {takes.map((take) => {
        const isActive = take.id === currentTakeId
        const isApproved = approvedTakeId === take.id
        const isFV = !isApproved && finalVisualTakeId === take.id

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

            {/* Status dot — emerald (approved) wins over amber (FV) */}
            {(isApproved || isFV) && (
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isApproved ? 'bg-emerald-500' : 'bg-amber-500'
                }`} />
            )}

            {/* Approve ✓ — visible on hover, only if NOT approved */}
            {!isApproved && (
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  onApproveTake(take.id)
                }}
                className="ml-0.5 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-emerald-900/50 text-zinc-500 hover:text-emerald-400 transition-all text-xs cursor-pointer"
                title={`Approve ${take.name}`}
              >
                ✓
              </span>
            )}

            {/* Revoke ↺ — always visible when approved */}
            {isApproved && (
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  onRevokeTake()
                }}
                className="ml-0.5 w-4 h-4 flex items-center justify-center rounded hover:bg-zinc-600 text-emerald-500 hover:text-zinc-300 transition-all text-xs cursor-pointer"
                title="Revoke approval"
              >
                ↺
              </span>
            )}

            {/* ✕ visibile solo su hover, solo se eliminabile */}
            {canDelete && (
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(take.id)
                }}
                className="ml-0.5 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-red-900/50 text-zinc-500 hover:text-red-400 transition-all text-xs"
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