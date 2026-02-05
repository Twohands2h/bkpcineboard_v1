'use client'

// ===================================================
// SNAPSHOT HISTORY — READ-ONLY AUDIT TRAIL (R3.5 + R3.6)
// ===================================================

interface Snapshot {
  id: string
  reason: string
  created_at: string
}

interface SnapshotHistoryProps {
  snapshots: Snapshot[]
  onRestore: (snapshotId: string) => void  // R3.6: emit restore request
}

export function SnapshotHistory({ snapshots, onRestore }: SnapshotHistoryProps) {
  if (snapshots.length === 0) {
    return (
      <div className="px-4 py-3 text-xs text-zinc-500">
        No snapshots yet
      </div>
    )
  }

  return (
    <div className="py-2">
      <div className="px-4 py-2 text-xs font-medium text-zinc-400 border-b border-zinc-800">
        Snapshot History ({snapshots.length})
      </div>
      
      <div className="max-h-64 overflow-y-auto">
        {snapshots.map((snapshot, index) => {
          const date = new Date(snapshot.created_at)
          const time = date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
          })
          const isLatest = index === 0

          return (
            <div
              key={snapshot.id}
              className="px-4 py-2 flex items-center gap-2 hover:bg-zinc-800/50 transition-colors"
            >
              {/* Indicator dot */}
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                isLatest ? 'bg-blue-500' : 'bg-zinc-600'
              }`} />

              {/* Time */}
              <span className="text-xs text-zinc-400 font-mono shrink-0">
                {time}
              </span>

              {/* Reason */}
              <span className="text-xs text-zinc-500 flex-1 truncate">
                {snapshot.reason.replace('_', ' ')}
              </span>

              {/* Latest badge */}
              {isLatest && (
                <span className="text-xs text-blue-400 shrink-0">
                  Latest
                </span>
              )}

              {/* R3.6: Restore button */}
              <button
                onClick={() => onRestore(snapshot.id)}
                className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded hover:bg-zinc-700 transition-colors shrink-0"
              >
                Restore
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
