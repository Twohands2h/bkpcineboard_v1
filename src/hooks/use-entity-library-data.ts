'use client'

import { useState, useEffect, useCallback } from 'react'
import { getEntitiesForLibraryAction } from '@/app/actions/entity-library'

// ============================================
// TYPES
// ============================================

export interface LibraryEntity {
  id: string
  name: string
  type: 'character' | 'environment' | 'asset'
  slug: string
  description: string | null
  master_prompt: string | null
  reference_images: string[] | null
  project_id: string
}

export interface EntityDetail extends LibraryEntity {
  workspace?: {
    board_id: string
    board_title: string
  } | null
}

interface UseEntityLibraryDataReturn {
  entities: LibraryEntity[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

interface UseEntityDetailReturn {
  entity: EntityDetail | null
  isLoading: boolean
  error: string | null
}

// ============================================
// ENTITIES LIST HOOK
// ============================================

/**
 * Carica la lista entities una sola volta per sessione.
 * Memoizzato, non refetch a ogni toggle del drawer.
 */
export function useEntityLibraryData(projectId: string): UseEntityLibraryDataReturn {
  const [entities, setEntities] = useState<LibraryEntity[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasFetched, setHasFetched] = useState(false)

  const fetchEntities = useCallback(async () => {
    if (!projectId) return
    
    setIsLoading(true)
    setError(null)

    try {
      const data = await getEntitiesForLibraryAction(projectId)
      setEntities(data)
      setHasFetched(true)
    } catch (err) {
      setError('Failed to load entities')
      console.error('Entity library fetch error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  // Fetch solo una volta
  useEffect(() => {
    if (!hasFetched && projectId) {
      fetchEntities()
    }
  }, [hasFetched, projectId, fetchEntities])

  return {
    entities,
    isLoading: isLoading && !hasFetched,
    error,
    refetch: fetchEntities,
  }
}

// ============================================
// ENTITY DETAIL HOOK
// ============================================

/**
 * Carica dettaglio singola entity con workspace info.
 */
export function useEntityDetail(
  entityId: string | null,
  projectId: string
): UseEntityDetailReturn {
  const [entity, setEntity] = useState<EntityDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!entityId || !projectId) {
      setEntity(null)
      return
    }

    const fetchDetail = async () => {
      setIsLoading(true)
      setError(null)

      try {
        // TODO: chiamare action per entity detail + workspace
        // const data = await getEntityDetailAction(entityId)
        // setEntity(data)
        
        // Placeholder per ora
        setEntity(null)
      } catch (err) {
        setError('Failed to load entity')
        console.error('Entity detail fetch error:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchDetail()
  }, [entityId, projectId])

  return {
    entity,
    isLoading,
    error,
  }
}
