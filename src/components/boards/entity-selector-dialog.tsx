'use client'

import { useState, useEffect, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getEntitiesForSelectorAction, type EntitySummary, type EntityType } from '@/app/actions/entity-selector'

// ============================================
// TYPES
// ============================================

interface EntitySelectorDialogProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
  entityType: EntityType
  onSelect: (entity: EntitySummary) => void
}

// ============================================
// TYPE CONFIG
// ============================================

const TYPE_CONFIG: Record<EntityType, { icon: string; label: string; plural: string }> = {
  character: { icon: '👤', label: 'Character', plural: 'Characters' },
  environment: { icon: '🌍', label: 'Environment', plural: 'Environments' },
  asset: { icon: '📦', label: 'Asset', plural: 'Assets' },
}

// ============================================
// SLUG GENERATOR
// ============================================

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50)
}

// ============================================
// COMPONENT
// ============================================

export function EntitySelectorDialog({
  isOpen,
  onClose,
  projectId,
  entityType,
  onSelect
}: EntitySelectorDialogProps) {
  const [isPending, startTransition] = useTransition()
  const [entities, setEntities] = useState<EntitySummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [mode, setMode] = useState<'select' | 'create'>('select')
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const config = TYPE_CONFIG[entityType]

  // Load entities on open
  useEffect(() => {
    if (!isOpen) return
    
    setIsLoading(true)
    setMode('select')
    setNewName('')
    setError(null)
    
    getEntitiesForSelectorAction(projectId, entityType)
      .then(data => {
        setEntities(data)
        if (data.length === 0) {
          setMode('create')
        }
      })
      .catch(err => {
        console.error('Failed to load entities:', err)
        setError('Failed to load entities')
      })
      .finally(() => setIsLoading(false))
  }, [isOpen, projectId, entityType])

  const handleClose = () => {
    setMode('select')
    setNewName('')
    setError(null)
    onClose()
  }

  const handleSelect = (entity: EntitySummary) => {
    onSelect(entity)
    handleClose()
  }

  // Create entity directly via Supabase client
  const handleCreate = () => {
    if (!newName.trim()) return
    
    setError(null)
    startTransition(async () => {
      try {
        const supabase = createClient()
        const slug = generateSlug(newName.trim())
        
        // FIXED: Use 'type' instead of 'entity_type'
        const { data, error: insertError } = await supabase
          .from('entities')
          .insert({
            project_id: projectId,
            name: newName.trim(),
            slug,
            type: entityType,  // CORRECT column name
            master_prompt: null,
            reference_images: [],
          })
          .select('id, name, slug, type, master_prompt, reference_images')
          .single()
        
        if (insertError) {
          throw new Error(insertError.message)
        }
        
        if (data) {
          const createdEntity: EntitySummary = {
            id: data.id,
            name: data.name,
            slug: data.slug,
            entity_type: data.type as EntityType,  // Map back to entity_type for interface
            master_prompt: data.master_prompt,
            reference_images: data.reference_images as string[] | null,
          }
          onSelect(createdEntity)
          handleClose()
        }
      } catch (err) {
        console.error('Failed to create entity:', err)
        setError(err instanceof Error ? err.message : 'Failed to create entity')
      }
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-purple-50">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <span>{config.icon}</span>
            {mode === 'select' ? `Select ${config.label}` : `New ${config.label}`}
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            {mode === 'select' 
              ? `Choose an existing ${config.label.toLowerCase()} or create a new one`
              : `Create a new ${config.label.toLowerCase()} for your project`
            }
          </p>
        </div>

        {/* Content */}
        <div className="p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full" />
            </div>
          ) : mode === 'select' ? (
            <div className="space-y-4">
              {entities.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {entities.map(entity => (
                    <button
                      key={entity.id}
                      onClick={() => handleSelect(entity)}
                      className="w-full flex items-center gap-3 p-3 text-left rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors"
                    >
                      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {entity.reference_images?.[0] ? (
                          <img 
                            src={entity.reference_images[0]} 
                            alt={entity.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-lg">{config.icon}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{entity.name}</p>
                        <p className="text-xs text-gray-500 truncate">@{entity.slug}</p>
                      </div>
                      <span className="text-gray-400">→</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <span className="text-4xl mb-2 block">{config.icon}</span>
                  <p>No {config.plural.toLowerCase()} yet</p>
                </div>
              )}

              <button
                onClick={() => setMode('create')}
                className="w-full flex items-center justify-center gap-2 p-3 text-indigo-600 font-medium border-2 border-dashed border-indigo-200 rounded-lg hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors"
              >
                <span>+</span>
                <span>Create New {config.label}</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {config.label} Name
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={`Enter ${config.label.toLowerCase()} name...`}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newName.trim()) {
                      handleCreate()
                    }
                  }}
                />
              </div>

              {entities.length > 0 && (
                <button
                  onClick={() => setMode('select')}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  ← Back to {config.plural.toLowerCase()} list
                </button>
              )}
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            Cancel
          </button>
          
          {mode === 'create' && (
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || isPending}
              className={`
                px-5 py-2 text-sm font-medium rounded-lg transition-all
                ${newName.trim() && !isPending
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }
              `}
            >
              {isPending ? 'Creating...' : `Create ${config.label}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
