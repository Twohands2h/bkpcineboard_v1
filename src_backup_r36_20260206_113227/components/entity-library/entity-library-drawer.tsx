'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useEntityLibrary } from '@/contexts/entity-library-context'
import { EntityLibraryList } from './entity-library-list'
import { EntityLibraryDetail } from './entity-library-detail'

interface EntityLibraryDrawerProps {
  projectId: string
}

/**
 * EntityLibraryDrawer
 * 
 * Drawer laterale destro (~360px).
 * Due stati interni: list | detail.
 * Board resta interattiva (no overlay).
 */
export function EntityLibraryDrawer({ projectId }: EntityLibraryDrawerProps) {
  const { isOpen, activeEntityId, closeLibrary, clearActiveEntity } = useEntityLibrary()
  const drawerRef = useRef<HTMLDivElement>(null)
  
  // Stato interno per preservare search e scroll
  const [searchQuery, setSearchQuery] = useState('')
  const [scrollPosition, setScrollPosition] = useState(0)

  // Determina mode basato su activeEntityId
  const mode = activeEntityId ? 'detail' : 'list'

  // ESC per chiudere
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeLibrary()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, closeLibrary])

  // Click outside per chiudere
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        isOpen &&
        drawerRef.current &&
        !drawerRef.current.contains(e.target as Node)
      ) {
        // Verifica che il click non sia sul trigger
        const target = e.target as HTMLElement
        if (!target.closest('[data-entity-library-trigger]')) {
          closeLibrary()
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, closeLibrary])

  // Back preserva search e scroll
  const handleBack = useCallback(() => {
    clearActiveEntity()
  }, [clearActiveEntity])

  // Salva scroll position quando si va a detail
  const handleSaveScroll = useCallback((position: number) => {
    setScrollPosition(position)
  }, [])

  if (!isOpen) return null

  return (
    <div
      ref={drawerRef}
      className="fixed top-0 right-0 h-full w-[360px] bg-white border-l border-gray-200 shadow-lg z-50 flex flex-col"
      role="dialog"
      aria-label="Entity Library"
    >
      {mode === 'list' ? (
        <EntityLibraryList
          projectId={projectId}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          scrollPosition={scrollPosition}
          onSaveScroll={handleSaveScroll}
          onClose={closeLibrary}
        />
      ) : (
        <EntityLibraryDetail
          projectId={projectId}
          entityId={activeEntityId!}
          onBack={handleBack}
          onClose={closeLibrary}
        />
      )}
    </div>
  )
}
