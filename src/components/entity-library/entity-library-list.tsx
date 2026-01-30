'use client'

import { useEffect, useRef, useMemo } from 'react'
import { useEntityLibrary } from '@/contexts/entity-library-context'
import { useEntityLibraryData } from '@/hooks/use-entity-library-data'

// ============================================
// TYPES
// ============================================

interface EntityLibraryListProps {
  projectId: string
  searchQuery: string
  onSearchChange: (query: string) => void
  scrollPosition: number
  onSaveScroll: (position: number) => void
  onClose: () => void
}

// ============================================
// CONSTANTS
// ============================================

const TYPE_CONFIG = {
  character: { icon: '👤', label: 'Characters' },
  environment: { icon: '🌍', label: 'Environments' },
  asset: { icon: '📦', label: 'Assets' },
} as const

// ============================================
// COMPONENT
// ============================================

export function EntityLibraryList({
  projectId,
  searchQuery,
  onSearchChange,
  scrollPosition,
  onSaveScroll,
  onClose,
}: EntityLibraryListProps) {
  const { openEntityDetail } = useEntityLibrary()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Fetch entities (cached per sessione)
  const { entities, isLoading, error } = useEntityLibraryData(projectId)

  // Autofocus search all'apertura
  useEffect(() => {
    searchInputRef.current?.focus()
  }, [])

  // Ripristina scroll position
  useEffect(() => {
    if (scrollContainerRef.current && scrollPosition > 0) {
      scrollContainerRef.current.scrollTop = scrollPosition
    }
  }, [scrollPosition])

  // Filtra entities per search
  const filteredEntities = useMemo(() => {
    if (!searchQuery.trim()) return entities
    const query = searchQuery.toLowerCase()
    return entities.filter(
      e => e.name.toLowerCase().includes(query) ||
           e.slug.toLowerCase().includes(query)
    )
  }, [entities, searchQuery])

  // Raggruppa per tipo
  const grouped = useMemo(() => ({
    character: filteredEntities.filter(e => e.type === 'character'),
    environment: filteredEntities.filter(e => e.type === 'environment'),
    asset: filteredEntities.filter(e => e.type === 'asset'),
  }), [filteredEntities])

  // Salva scroll prima di navigare a detail
  const handleEntityClick = (entityId: string) => {
    if (scrollContainerRef.current) {
      onSaveScroll(scrollContainerRef.current.scrollTop)
    }
    openEntityDetail(entityId, 'global')
  }

  const hasAnyEntities = entities.length > 0
  const hasFilteredResults = filteredEntities.length > 0

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Memory</h2>
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

      {/* Search */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="relative">
          <svg 
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search entities..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200"
          />
        </div>
      </div>

      {/* Content */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto"
      >
        {isLoading ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-gray-500">Loading...</p>
          </div>
        ) : error ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        ) : !hasAnyEntities ? (
          // Empty state: nessuna entity nel progetto
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-gray-500 mb-2">No Entities yet.</p>
            <p className="text-xs text-gray-400">
              Create one manually or crystallize from a Board.
            </p>
          </div>
        ) : !hasFilteredResults ? (
          // Empty state: nessun risultato search
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-gray-500">
              No entities matching "{searchQuery}"
            </p>
          </div>
        ) : (
          // Entity sections
          <div className="py-2">
            {(['character', 'environment', 'asset'] as const).map((type) => {
              const items = grouped[type]
              if (items.length === 0) return null

              return (
                <div key={type} className="mb-4">
                  <div className="px-4 py-2">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {TYPE_CONFIG[type].label}
                    </h3>
                  </div>
                  <div>
                    {items.map((entity) => (
                      <EntityRow
                        key={entity.id}
                        entity={entity}
                        onClick={() => handleEntityClick(entity.id)}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

// ============================================
// ENTITY ROW
// ============================================

interface EntityRowProps {
  entity: {
    id: string
    name: string
    type: 'character' | 'environment' | 'asset'
    slug: string
    reference_images: string[] | null
  }
  onClick: () => void
}

function EntityRow({ entity, onClick }: EntityRowProps) {
  const config = TYPE_CONFIG[entity.type]
  const thumbnail = entity.reference_images?.[0]

  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-2 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
    >
      {/* Thumbnail o icona */}
      <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
        {thumbnail ? (
          <img 
            src={thumbnail} 
            alt="" 
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="text-lg">{config.icon}</span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {entity.name}
        </p>
        <p className="text-xs text-gray-500 truncate">
          @{entity.slug}
        </p>
      </div>

      {/* Arrow */}
      <svg 
        className="w-4 h-4 text-gray-400 flex-shrink-0" 
        fill="none" 
        viewBox="0 0 24 24" 
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  )
}
