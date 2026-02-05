'use client'

import { SnapshotHistory } from './snapshot-history'

// ===================================================
// TAKE TABS — NAVIGAZIONE TRA TAKES (R3.3 + R3.5 + R3.6)
// ===================================================

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

interface Snapshot {
  id: string
  reason: string
  created_at: string
}

interface TakeTabsProps {
  takes: Take[]
  currentTakeId: string | null
  onTakeChange: (takeId: string) => void
  isDirty: boolean  // R3.5: dirty indicator
  snapshots: Snapshot[]  // R3.5: snapshot history
  showHistory: boolean
  onToggleHistory: () => void
  onRestore: (snapshotId: string) => void  // R3.6: restore handler
}

export function TakeTabs({ 
  takes, 
  currentTakeId, 
  onTakeChange,
  isDirty,
  snapshots,
  showHistory,
  onToggleHistory,
  onRestore
}: TakeTabsProps) {
  return (
    <div className="relative">
      <nav className="h-10 bg-zinc-900 border-b border-zinc-800 flex items-center px-4 gap-1 shrink-0 overflow-x-auto">
        {/* Take Tabs */}
        {takes.map((take) => {
          const isActive = take.id === currentTakeId

          return (
            <button
              key={take.id}
              onClick={() => onTakeChange(take.id)}
              className={`
                px-3 py-1.5 rounded text-sm transition-colors shrink-0 flex items-center gap-2
                ${isActive 
                  ? 'bg-zinc-700 text-zinc-100' 
                  : 'bg-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                }
              `}
            >
              {take.name}
              {/* R3.5: Dirty indicator dot */}
              {isActive && isDirty && (
                <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full" />
              )}
            </button>
          )
        })}

        {/* Spacer */}
        <div className="flex-1" />

        {/* R3.5: History button */}
        <button
          onClick={onToggleHistory}
          className={`
            px-3 py-1.5 rounded text-sm transition-colors shrink-0
            ${showHistory
              ? 'bg-zinc-700 text-zinc-100'
              : 'bg-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }
          `}
        >
          History {showHistory ? '▴' : '▾'}
        </button>
      </nav>

      {/* R3.5 + R3.6: History dropdown */}
      {showHistory && (
        <div className="absolute right-4 top-10 w-80 bg-zinc-900 border border-zinc-800 rounded shadow-lg z-50">
          <SnapshotHistory 
            snapshots={snapshots} 
            onRestore={onRestore}
          />
        </div>
      )}
    </div>
  )
}
