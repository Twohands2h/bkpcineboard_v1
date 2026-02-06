'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBoardAction } from '@/app/actions/boards'

interface CreateBoardDialogProps {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * CreateBoardDialog - Dialog minimale per creare una board
 * 
 * UI neutra, solo campi essenziali (title, description).
 * Usa native HTML dialog per semplicità.
 */
export function CreateBoardDialog({
  projectId,
  open,
  onOpenChange
}: CreateBoardDialogProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const formData = new FormData(e.currentTarget)

    try {
      const result = await createBoardAction(projectId, formData)
      onOpenChange(false)
      router.push(`/projects/${projectId}/boards/${result.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create board')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-lg shadow-lg w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">Create Board</h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="title"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Title *
              </label>
              <input
                type="text"
                id="title"
                name="title"
                required
                autoFocus
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:border-gray-500"
                placeholder="Board title"
              />
            </div>

            <div>
              <label
                htmlFor="description"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Description
              </label>
              <textarea
                id="description"
                name="description"
                rows={3}
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:border-gray-500"
                placeholder="Optional description"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm bg-gray-900 text-white rounded hover:bg-gray-800 disabled:opacity-50"
            >
              {isSubmitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}