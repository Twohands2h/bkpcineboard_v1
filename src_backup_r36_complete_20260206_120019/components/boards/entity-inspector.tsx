'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getEntityForInspectorAction, type EntitySummary, type EntityType } from '@/app/actions/entity-selector'

// ============================================
// TYPES
// ============================================

interface EntityInspectorProps {
  entityId: string | null
  projectId: string
  onClose: () => void
}

// ============================================
// TYPE CONFIG
// ============================================

const TYPE_CONFIG: Record<EntityType, { icon: string; label: string; color: string }> = {
  character: { icon: '👤', label: 'Character', color: 'text-violet-600 bg-violet-50 border-violet-200' },
  environment: { icon: '🌍', label: 'Environment', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  asset: { icon: '📦', label: 'Asset', color: 'text-amber-600 bg-amber-50 border-amber-200' },
}

// ============================================
// COMPONENT
// ============================================

export function EntityInspector({
  entityId,
  projectId,
  onClose
}: EntityInspectorProps) {
  const [entity, setEntity] = useState<EntitySummary | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Load entity data when ID changes
  useEffect(() => {
    if (!entityId) {
      setEntity(null)
      return
    }

    setIsLoading(true)
    getEntityForInspectorAction(entityId)
      .then(data => setEntity(data))
      .catch(err => {
        console.error('Failed to load entity:', err)
        setEntity(null)
      })
      .finally(() => setIsLoading(false))
  }, [entityId])

  // Don't render if no entity selected
  if (!entityId) return null

  const config = entity ? TYPE_CONFIG[entity.entity_type] : null

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="font-medium text-gray-900">Entity Inspector</h3>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
          title="Close inspector"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full" />
          </div>
        ) : entity ? (
          <div className="p-4 space-y-6">
            {/* Entity Header */}
            <div className="flex items-start gap-3">
              {/* Avatar/Image */}
              <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                {entity.reference_images?.[0] ? (
                  <img 
                    src={entity.reference_images[0]} 
                    alt={entity.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-2xl">{config?.icon}</span>
                )}
              </div>
              
              {/* Name + Type */}
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-gray-900 text-lg leading-tight">
                  {entity.name}
                </h4>
                <p className="text-sm text-gray-500">@{entity.slug}</p>
                {config && (
                  <span className={`inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 text-xs font-medium rounded-full border ${config.color}`}>
                    <span>{config.icon}</span>
                    {config.label}
                  </span>
                )}
              </div>
            </div>

            {/* Master Prompt */}
            <div>
              <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Master Prompt
              </h5>
              {entity.master_prompt ? (
                <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-700 leading-relaxed font-mono">
                  {entity.master_prompt}
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">
                  No master prompt defined
                </p>
              )}
            </div>

            {/* Reference Images */}
            <div>
              <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Reference Images
              </h5>
              {entity.reference_images && entity.reference_images.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {entity.reference_images.slice(0, 4).map((url, idx) => (
                    <div 
                      key={idx}
                      className="aspect-square rounded-lg bg-gray-100 overflow-hidden"
                    >
                      <img 
                        src={url} 
                        alt={`Reference ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                  {entity.reference_images.length > 4 && (
                    <div className="aspect-square rounded-lg bg-gray-100 flex items-center justify-center text-sm text-gray-500">
                      +{entity.reference_images.length - 4} more
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">
                  No reference images
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <p>Entity not found</p>
          </div>
        )}
      </div>

      {/* Footer - Open Workspace */}
      {entity && (
        <div className="p-4 border-t border-gray-100">
          <Link
            href={`/projects/${projectId}/entities/${entity.id}`}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <span>Open Workspace</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </Link>
        </div>
      )}
    </div>
  )
}
