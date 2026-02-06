'use client'

import { useEntityLibrary } from '@/contexts/entity-library-context'
import { useEffect } from 'react'

/**
 * EntityLibraryTrigger
 * 
 * Icona globale nel header progetto.
 * Click o ⌘E apre la Entity Library.
 */
export function EntityLibraryTrigger() {
  const { isOpen, openLibrary, closeLibrary } = useEntityLibrary()

  // Shortcut ⌘E / Ctrl+E
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault()
        if (isOpen) {
          closeLibrary()
        } else {
          openLibrary()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, openLibrary, closeLibrary])

  return (
    <button
      onClick={() => isOpen ? closeLibrary() : openLibrary()}
      data-entity-library-trigger
      className={`
        p-2 rounded-md transition-colors
        ${isOpen 
          ? 'bg-gray-200 text-gray-900' 
          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
        }
      `}
      title="Entity Library (⌘E)"
      aria-label="Toggle Entity Library"
    >
      <span className="text-lg">🧬</span>
    </button>
  )
}
