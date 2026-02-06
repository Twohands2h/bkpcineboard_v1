'use client'

import Link from 'next/link'
import type { BoardWorkspaceInfo } from '@/app/actions/board-links'

// ============================================
// TYPES
// ============================================

interface BoardStatusBadgeProps {
  workspaceInfo: BoardWorkspaceInfo | null
}

// ============================================
// ENTITY TYPE ICONS
// ============================================

const TYPE_ICONS: Record<string, string> = {
  character: '👤',
  environment: '🌍',
  asset: '📦',
  shot: '🎬',
}

// ============================================
// BOARD STATUS BADGE
// ============================================

/**
 * Mostra lo stato semantico della Board:
 * - Free Board
 * - Workspace for: [Entity/Shot]
 * 
 * Il link al target è navigabile
 */
export function BoardStatusBadge({ workspaceInfo }: BoardStatusBadgeProps) {
  if (!workspaceInfo) {
    // Free Board
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm">
        <span className="text-gray-400">○</span>
        <span>Free Board</span>
      </div>
    )
  }

  // Workspace Board
  const icon = TYPE_ICONS[workspaceInfo.target_type] || '📋'

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-sm">
      <span className="text-indigo-400">●</span>
      <span className="text-indigo-500">Workspace for:</span>
      <Link 
        href={workspaceInfo.target_url}
        className="font-medium hover:underline flex items-center gap-1"
      >
        <span>{icon}</span>
        <span>{workspaceInfo.target_name}</span>
      </Link>
    </div>
  )
}
