'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { getEntityDetailAction, createEntityWorkspaceAction } from '@/app/actions/entity-library'

// ============================================
// TYPES
// ============================================

interface EntityDetail {
  id: string
  name: string
  type: 'character' | 'environment' | 'asset'
  slug: string
  description: string | null
  master_prompt: string | null
  reference_images: string[] | null
  project_id: string
  status: 'active' | 'archived'
  workspace: {
    board_id: string
    board_title: string
  } | null
}

interface EntityLibraryDetailProps {
  projectId: string
  entityId: string
  onBack: () => void
  onClose: () => void
}

// ============================================
// COMPONENT
// ============================================

export function EntityLibraryDetail({
  projectId,
  entityId,
  onBack,
  onClose,
}: EntityLibraryDetailProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [entity, setEntity] = useState<EntityDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)
  const [workspaceError, setWorkspaceError] = useState<string | null>(null)

  // Fetch entity detail
  useEffect(() => {
    const fetchEntity = async () => {
      setIsLoading(true)
      try {
        const data = await getEntityDetailAction(entityId)
        setEntity(data)
      } catch (err) {
        console.error('Failed to fetch entity:', err)
      } finally {
        setIsLoading(false)
      }
    }
    fetchEntity()
  }, [entityId])

  // Copy to clipboard con feedback
  const handleCopy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text)
    setCopyFeedback(label)
    setTimeout(() => setCopyFeedback(null), 2000)
  }

  // Download singola immagine
  const handleDownloadSingle = (url: string, filename: string) => {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Download handler
  const handleDownload = () => {
    if (!entity?.reference_images?.length) return
    
    if (entity.reference_images.length === 1) {
      handleDownloadSingle(
        entity.reference_images[0], 
        `${entity.slug}-reference.jpg`
      )
    } else {
      // TODO: implementare ZIP con JSZip o server action
      console.log('Download ZIP:', entity.reference_images)
    }
  }

  // Open workspace
  const handleOpenWorkspace = () => {
    if (entity?.workspace) {
      onClose()
      router.push(`/projects/${projectId}/boards/${entity.workspace.board_id}`)
    }
  }

  // Create workspace
  const handleCreateWorkspace = () => {
    if (!entity) return
    
    setWorkspaceError(null)
    startTransition(async () => {
      const result = await createEntityWorkspaceAction(entityId, projectId)
      
      if (result.success && result.workspace) {
        // Aggiorna stato locale per mostrare "Open Workspace"
        setEntity(prev => prev ? {
          ...prev,
          workspace: result.workspace!
        } : null)
      } else {
        setWorkspaceError(result.error || 'Failed to create workspace')
      }
    })
  }

  // Export handlers (TODO)
  const handleExportMarkdown = () => console.log('Export MD:', entityId)
  const handleExportPdf = () => console.log('Export PDF:', entityId)
  const handleExportTxt = () => console.log('Export TXT:', entityId)

  // Archive entity (TODO)
  const handleArchive = () => console.log('Archive:', entityId)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    )
  }

  if (!entity) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-gray-500">Entity not found</p>
      </div>
    )
  }

  const isArchived = entity.status === 'archived'

  return (
    <>
      {/* Header */}
      <div className={`flex items-center gap-2 px-4 py-3 border-b ${isArchived ? 'bg-gray-50 border-gray-300' : 'border-gray-200'}`}>
        <button
          onClick={onBack}
          className="p-1 text-gray-400 hover:text-gray-600 rounded"
          aria-label="Back to list"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className={`flex-1 text-lg font-semibold truncate ${isArchived ? 'text-gray-500' : 'text-gray-900'}`}>
          {entity.name}
        </h2>
        {isArchived && (
          <span className="px-2 py-0.5 bg-gray-500 text-white text-xs font-medium rounded-full">
            Archived
          </span>
        )}
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 rounded"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Images */}
        {entity.reference_images && entity.reference_images.length > 0 && (
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Reference Images
              </h3>
              <button
                onClick={handleDownload}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                {entity.reference_images.length === 1 ? 'Download' : 'Download ZIP'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {entity.reference_images.map((url, index) => (
                <div 
                  key={index}
                  className="aspect-square rounded-md overflow-hidden bg-gray-100"
                >
                  <img
                    src={url}
                    alt={`${entity.name} reference ${index + 1}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Master Prompt */}
        {entity.master_prompt && (
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Master Prompt
              </h3>
              <button
                onClick={() => handleCopy(entity.master_prompt!, 'Prompt')}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                {copyFeedback === 'Prompt' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {entity.master_prompt}
            </p>
          </div>
        )}

        {/* Notes / Description */}
        {entity.description && (
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Notes
              </h3>
              <button
                onClick={() => handleCopy(entity.description!, 'Notes')}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                {copyFeedback === 'Notes' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {entity.description}
            </p>
          </div>
        )}

        {/* Empty state se nessun contenuto */}
        {!entity.reference_images?.length && !entity.master_prompt && !entity.description && (
          <div className="p-4 text-center">
            <p className="text-sm text-gray-500">
              No content yet. Add content in the Entity Workspace.
            </p>
          </div>
        )}
      </div>

      {/* Actions Footer */}
      <div className="border-t border-gray-200 p-4 space-y-2">
        {isArchived ? (
          // Archived entity: read-only notice
          <div className="text-center py-2">
            <p className="text-sm text-gray-500">
              This entity has been archived.
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Content is read-only. Remove the reference node from your Board if no longer needed.
            </p>
          </div>
        ) : (
          <>
            {/* Primary: Open/Create Workspace */}
            {entity.workspace ? (
              <button
                onClick={handleOpenWorkspace}
                className="w-full py-2 px-4 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 transition-colors"
              >
                Open Workspace
              </button>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={handleCreateWorkspace}
                  disabled={isPending}
                  className={`w-full py-2 px-4 text-sm font-medium rounded-md transition-colors ${
                    isPending 
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
                  }`}
                  title="A workspace lets you explore and evolve this Entity over time."
                >
                  {isPending ? 'Creating...' : 'Create Workspace'}
                </button>
                {workspaceError && (
                  <p className="text-xs text-red-500 text-center">{workspaceError}</p>
                )}
              </div>
            )}

            {/* Export Options */}
            <div className="flex gap-2">
              <button
                onClick={handleExportMarkdown}
                className="flex-1 py-2 px-3 text-xs text-gray-600 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors"
              >
                Export MD
              </button>
              <button
                onClick={handleExportPdf}
                className="flex-1 py-2 px-3 text-xs text-gray-600 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors"
              >
                Export PDF
              </button>
              <button
                onClick={handleExportTxt}
                className="flex-1 py-2 px-3 text-xs text-gray-600 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors"
              >
                Export TXT
              </button>
            </div>

            {/* Secondary Actions */}
            <div className="pt-2 border-t border-gray-100 flex justify-between">
              <button
                onClick={() => console.log('Edit metadata')}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Edit metadata
              </button>
              <button
                onClick={handleArchive}
                className="text-xs text-red-500 hover:text-red-700"
              >
                Archive
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
