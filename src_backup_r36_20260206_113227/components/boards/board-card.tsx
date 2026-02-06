'use client'

import { useState, useTransition, useEffect } from 'react'
import Link from 'next/link'
import { deleteBoardAction } from '@/app/actions/boards'
import { getBoardWorkspaceInfoAction, type BoardWorkspaceInfo } from '@/app/actions/board-links'
import type { Board } from '@/lib/db/queries/boards'

interface BoardCardProps {
  board: Board
  projectId: string
}

/**
 * BoardCard - Card component per visualizzare una board nella lista
 * 
 * Click naviga alla board detail page.
 * Hover mostra delete button.
 */
export function BoardCard({ board, projectId }: BoardCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [workspaceInfo, setWorkspaceInfo] = useState<BoardWorkspaceInfo | null>(null)

  // Fetch workspace info when confirm dialog opens
  useEffect(() => {
    if (showConfirm && workspaceInfo === null) {
      getBoardWorkspaceInfoAction(board.id).then(setWorkspaceInfo)
    }
  }, [showConfirm, board.id, workspaceInfo])

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setShowConfirm(true)
  }

  const handleConfirmDelete = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    startTransition(async () => {
      await deleteBoardAction(board.id, projectId)
      setShowConfirm(false)
    })
  }

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setShowConfirm(false)
  }

  return (
    <Link
      href={`/projects/${projectId}/boards/${board.id}`}
      className="block border border-gray-200 rounded-lg p-4 hover:border-gray-400 transition-colors relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false)
        if (!isPending) setShowConfirm(false)
      }}
    >
      <h3 className="font-medium text-gray-900 truncate pr-8">
        {board.title}
      </h3>
      {board.description && (
        <p className="mt-1 text-sm text-gray-500 line-clamp-2">
          {board.description}
        </p>
      )}

      {/* Delete Button - visible on hover */}
      {isHovered && !showConfirm && (
        <button
          onClick={handleDelete}
          className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
          title="Delete board"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}

      {/* Confirm Delete */}
      {showConfirm && (
        <div className="absolute inset-0 bg-white/95 rounded-lg flex flex-col items-center justify-center gap-2 p-4">
          <p className="text-sm text-gray-700 text-center">Delete this board?</p>
          
          {/* Workspace Warning */}
          {workspaceInfo && (
            <p className="text-xs text-amber-600 text-center bg-amber-50 px-2 py-1 rounded">
              This is the workspace of {workspaceInfo.targetName}.<br />
              The {workspaceInfo.targetType} will not be deleted.
            </p>
          )}
          
          <div className="flex gap-2 mt-1">
            <button
              onClick={handleCancelDelete}
              disabled={isPending}
              className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmDelete}
              disabled={isPending}
              className="px-3 py-1 text-sm text-white bg-red-500 hover:bg-red-600 rounded transition-colors disabled:opacity-50"
            >
              {isPending ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      )}
    </Link>
  )
}
