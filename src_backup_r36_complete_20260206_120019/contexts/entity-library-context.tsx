'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

// ============================================
// TYPES
// ============================================

type Origin = 'global' | 'entity-ref'

interface EntityLibraryState {
  isOpen: boolean
  activeEntityId: string | null
  origin: Origin
  sourceNodeId?: string // passivo, per contesto futuro
}

interface EntityLibraryContextValue extends EntityLibraryState {
  // Azioni
  openLibrary: () => void
  openEntityDetail: (entityId: string, origin?: Origin, sourceNodeId?: string) => void
  closeLibrary: () => void
  clearActiveEntity: () => void
}

// ============================================
// CONTEXT
// ============================================

const EntityLibraryContext = createContext<EntityLibraryContextValue | null>(null)

// ============================================
// PROVIDER
// ============================================

interface EntityLibraryProviderProps {
  children: ReactNode
}

export function EntityLibraryProvider({ children }: EntityLibraryProviderProps) {
  const [state, setState] = useState<EntityLibraryState>({
    isOpen: false,
    activeEntityId: null,
    origin: 'global',
    sourceNodeId: undefined,
  })

  // Apre il drawer sulla lista
  const openLibrary = useCallback(() => {
    setState(prev => ({
      ...prev,
      isOpen: true,
      activeEntityId: null,
      origin: 'global',
      sourceNodeId: undefined,
    }))
  }, [])

  // Apre il drawer direttamente su un'Entity (da EntityRef o altro)
  const openEntityDetail = useCallback((
    entityId: string, 
    origin: Origin = 'global',
    sourceNodeId?: string
  ) => {
    setState(prev => ({
      ...prev,
      isOpen: true,
      activeEntityId: entityId,
      origin,
      sourceNodeId,
    }))
  }, [])

  // Chiude il drawer
  const closeLibrary = useCallback(() => {
    setState(prev => ({
      ...prev,
      isOpen: false,
      // Manteniamo activeEntityId per preservare stato se riaperto
    }))
  }, [])

  // Torna alla lista (clear active entity)
  const clearActiveEntity = useCallback(() => {
    setState(prev => ({
      ...prev,
      activeEntityId: null,
      origin: 'global',
      sourceNodeId: undefined,
    }))
  }, [])

  const value: EntityLibraryContextValue = {
    ...state,
    openLibrary,
    openEntityDetail,
    closeLibrary,
    clearActiveEntity,
  }

  return (
    <EntityLibraryContext.Provider value={value}>
      {children}
    </EntityLibraryContext.Provider>
  )
}

// ============================================
// HOOK
// ============================================

export function useEntityLibrary() {
  const context = useContext(EntityLibraryContext)
  if (!context) {
    throw new Error('useEntityLibrary must be used within EntityLibraryProvider')
  }
  return context
}
