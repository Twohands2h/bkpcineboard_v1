'use client'

import { useState, useEffect, useCallback } from 'react'
import {
    listEntitiesAction,
    createEntityAction,
    deleteEntityAction,
    type Entity,
    type EntityType,
} from '@/app/actions/entities'
import { EntityEditOverlay } from './entity-edit-overlay'
import { createClient } from '@/lib/supabase/client'
import { invalidateEntityCache, bumpEntityVersion } from '@/lib/entities/entity-cache'

// ── Constants ──

const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
    character: 'Character',
    environment: 'Environment',
    prop: 'Prop',
    cinematography: 'Cinematography',
}

const ENTITY_TYPE_COLORS: Record<EntityType, string> = {
    character: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    environment: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    prop: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    cinematography: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
}

// ── Props ──

interface EntityLibraryProps {
    projectId: string
    onClose: () => void
    /** Called when user wants to insert entity ref into canvas */
    onInsertRef?: (entity: Entity) => void
}

// ── Component ──

export function EntityLibrary({ projectId, onClose, onInsertRef }: EntityLibraryProps) {
    const [entities, setEntities] = useState<Entity[]>([])
    const [loading, setLoading] = useState(true)
    const [filterType, setFilterType] = useState<EntityType | 'all'>('all')
    const [editingEntity, setEditingEntity] = useState<Entity | null>(null)
    const [showCreate, setShowCreate] = useState(false)

    // ── Load ──

    const loadEntities = useCallback(async () => {
        setLoading(true)
        const list = await listEntitiesAction(projectId)
        setEntities(list)
        setLoading(false)
    }, [projectId])

    useEffect(() => { loadEntities() }, [loadEntities])

    // ── Create ──

    const [newName, setNewName] = useState('')
    const [newType, setNewType] = useState<EntityType>('character')
    const [creating, setCreating] = useState(false)

    const handleCreate = async () => {
        if (!newName.trim() || creating) return
        setCreating(true)
        const entity = await createEntityAction({
            projectId,
            name: newName.trim(),
            entityType: newType,
        })
        if (entity) {
            setEntities(prev => [...prev, entity])
            setNewName('')
            setShowCreate(false)
            // Open edit overlay immediately
            setEditingEntity(entity)
        }
        setCreating(false)
    }

    // ── Delete ──

    const handleDelete = async (entityId: string) => {
        if (!confirm('Delete this entity? This cannot be undone.')) return
        const ok = await deleteEntityAction(entityId)
        if (ok) setEntities(prev => prev.filter(e => e.id !== entityId))
    }

    // ── Filter ──

    const filtered = filterType === 'all'
        ? entities
        : entities.filter(e => e.entity_type === filterType)

    // ── Edit callback ──

    const handleEditSaved = (updated: Entity) => {
        setEntities(prev => prev.map(e => e.id === updated.id ? updated : e))
        invalidateEntityCache(updated.id)
        bumpEntityVersion()
        setEditingEntity(null)
    }

    // ── Render ──

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
                <div
                    className="bg-zinc-900 border border-zinc-700 rounded-lg w-[720px] max-w-[95vw] max-h-[80vh] flex flex-col"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
                        <div className="flex items-center gap-3">
                            <h2 className="text-sm font-semibold text-zinc-100">Entity Library</h2>
                            <span className="text-[10px] text-zinc-500">
                                {entities.length} {entities.length === 1 ? 'entity' : 'entities'}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowCreate(prev => !prev)}
                                className="px-2.5 py-1 text-[10px] rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors"
                            >
                                + New Entity
                            </button>
                            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors">✕</button>
                        </div>
                    </div>

                    {/* Create form (collapsible) */}
                    {showCreate && (
                        <div className="px-6 py-3 border-b border-zinc-800 bg-zinc-800/30">
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
                                    placeholder="Entity name…"
                                    className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                                    autoFocus
                                />
                                <select
                                    value={newType}
                                    onChange={e => setNewType(e.target.value as EntityType)}
                                    className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300 focus:outline-none"
                                >
                                    {(Object.entries(ENTITY_TYPE_LABELS) as [EntityType, string][]).map(([k, v]) => (
                                        <option key={k} value={k}>{v}</option>
                                    ))}
                                </select>
                                <button
                                    onClick={handleCreate}
                                    disabled={!newName.trim() || creating}
                                    className="px-3 py-1.5 text-[10px] rounded bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-50 transition-colors"
                                >
                                    {creating ? '…' : 'Create'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Type filter tabs */}
                    <div className="flex items-center gap-1 px-6 py-2 border-b border-zinc-800/50">
                        <button
                            onClick={() => setFilterType('all')}
                            className={`px-2 py-0.5 text-[10px] rounded transition-colors ${filterType === 'all' ? 'bg-zinc-700 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                            All
                        </button>
                        {(Object.entries(ENTITY_TYPE_LABELS) as [EntityType, string][]).map(([k, v]) => (
                            <button
                                key={k}
                                onClick={() => setFilterType(k)}
                                className={`px-2 py-0.5 text-[10px] rounded transition-colors ${filterType === k ? 'bg-zinc-700 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`}
                            >
                                {v}
                            </button>
                        ))}
                    </div>

                    {/* Entity list */}
                    <div className="flex-1 overflow-y-auto px-6 py-3">
                        {loading ? (
                            <p className="text-xs text-zinc-600 italic py-8 text-center">Loading…</p>
                        ) : filtered.length === 0 ? (
                            <p className="text-xs text-zinc-600 italic py-8 text-center">
                                {entities.length === 0 ? 'No entities yet. Create one above.' : 'No entities match this filter.'}
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {filtered.map(entity => (
                                    <EntityRow
                                        key={entity.id}
                                        entity={entity}
                                        onEdit={() => setEditingEntity(entity)}
                                        onDelete={() => handleDelete(entity.id)}
                                        onInsertRef={onInsertRef ? () => onInsertRef(entity) : undefined}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Edit overlay */}
            {editingEntity && (
                <EntityEditOverlay
                    entity={editingEntity}
                    projectId={projectId}
                    onSave={handleEditSaved}
                    onClose={() => setEditingEntity(null)}
                />
            )}
        </>
    )
}

// ── Entity Row ──

function EntityRow({ entity, onEdit, onDelete, onInsertRef }: {
    entity: Entity
    onEdit: () => void
    onDelete: () => void
    onInsertRef?: () => void
}) {
    const typeColor = ENTITY_TYPE_COLORS[entity.entity_type] ?? 'text-zinc-400 bg-zinc-800 border-zinc-700'
    const mediaCount = (entity.content as any)?.media?.length ?? 0
    const promptCount = (entity.content as any)?.prompts?.length ?? 0
    const description = (entity.content as any)?.description ?? ''
    const thumbnail = (() => {
        const tp = (entity.content as any)?.thumbnail_path
        const firstMedia = (entity.content as any)?.media?.[0]
        const sp = tp || firstMedia?.storage_path || firstMedia?.storagePath
        if (!sp) return firstMedia?.src || null
        const bucket = firstMedia?.kind === 'video' ? 'take-videos' : (firstMedia?.bucket || 'take-images')
        return createClient().storage.from(bucket).getPublicUrl(sp).data.publicUrl
    })()

    return (
        <div className="group flex items-start gap-3 p-3 bg-zinc-800/40 border border-zinc-700/50 rounded-lg hover:border-zinc-600/60 transition-colors">
            {/* Thumbnail */}
            <div className="w-12 h-12 shrink-0 rounded bg-zinc-800 border border-zinc-700 flex items-center justify-center overflow-hidden">
                {thumbnail ? (
                    <img src={thumbnail} alt="" className="w-full h-full object-cover" />
                ) : (
                    <span className="text-zinc-600 text-lg">
                        {entity.entity_type === 'character' ? '👤' :
                         entity.entity_type === 'environment' ? '🌍' :
                         entity.entity_type === 'prop' ? '🎭' : '🎬'}
                    </span>
                )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium text-zinc-200 truncate">{entity.name}</span>
                    <span className={`text-[8px] font-medium px-1.5 py-0.5 rounded border shrink-0 ${typeColor}`}>
                        {ENTITY_TYPE_LABELS[entity.entity_type]}
                    </span>
                </div>
                {description && (
                    <p className="text-[10px] text-zinc-500 truncate">{description}</p>
                )}
                <div className="flex items-center gap-2 mt-1">
                    {mediaCount > 0 && <span className="text-[9px] text-zinc-600">{mediaCount} media</span>}
                    {promptCount > 0 && <span className="text-[9px] text-zinc-600">{promptCount} prompts</span>}
                </div>
            </div>

            {/* Actions (hover) */}
            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                {onInsertRef && (
                    <button
                        onClick={onInsertRef}
                        className="px-2 py-1 text-[9px] rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                        title="Insert reference into canvas"
                    >
                        + Ref
                    </button>
                )}
                <button
                    onClick={onEdit}
                    className="px-2 py-1 text-[9px] rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors"
                >
                    Edit
                </button>
                <button
                    onClick={onDelete}
                    className="px-2 py-1 text-[9px] rounded text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                    ✕
                </button>
            </div>
        </div>
    )
}
