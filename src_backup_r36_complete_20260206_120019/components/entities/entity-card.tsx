'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { deleteEntityAction } from '@/app/actions/entities'

interface EntityCardProps {
  entity: {
    id: string
    name: string
    slug: string
    description: string | null
  }
  projectId: string
}

/**
 * EntityCard - Card per visualizzare un'entity nella lista
 * 
 * Click naviga al detail.
 * Hover mostra delete button.
 */
export function EntityCard({ entity, projectId }: EntityCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setShowConfirm(true)
  }

  const handleConfirmDelete = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    startTransition(async () => {
      await deleteEntityAction(entity.id, projectId)
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
      href={`/projects/${projectId}/entities/${entity.id}`}
      className="block p-4 border rounded-md hover:border-primary transition-colors relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false)
        if (!isPending) setShowConfirm(false)
      }}
    >
      <div className="flex items-center justify-between">
        <div className="pr-8">
          <h3 className="font-medium">{entity.name}</h3>
          {entity.description && (
            <p className="text-sm text-muted-foreground line-clamp-1">
              {entity.description}
            </p>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          @{entity.slug}
        </span>
      </div>

      {/* Delete Button - visible on hover */}
      {isHovered && !showConfirm && (
        <button
          onClick={handleDelete}
          className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
          title="Delete entity"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}

      {/* Confirm Delete */}
      {showConfirm && (
        <div className="absolute inset-0 bg-white/95 rounded-md flex flex-col items-center justify-center gap-2 p-4">
          <p className="text-sm text-gray-700 text-center">
            Delete "{entity.name}"?
          </p>
          <p className="text-xs text-amber-600 text-center">
            Associated workspace boards will be unlinked.
          </p>
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
