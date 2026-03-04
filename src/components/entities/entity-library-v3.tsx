'use client'

import { useState, useEffect, useCallback } from 'react'
import {
    listEntitiesAction,
    createEntityAction,
    type Entity,
    type EntityType,
} from '@/app/actions/entities'
import {
    countEntityRefsInProjectAction,
    deleteEntityCascadeAction,
    replaceEntityRefsAction,
    type EntityRefUsage,
} from '@/app/actions/entity-ref-ops'
import { EntityEditOverlay } from './entity-edit-overlay'
import { invalidateEntityCache, bumpEntityVersion } from '@/lib/entities/entity-cache'
import { ENTITY_TYPE_UI, getEntityTypeUI } from '@/lib/entities/entity-type-ui'

// ── Props ──

interface EntityLibraryProps {
    projectId: string
    onClose: () => void
    /** Called when user wants to insert entity ref into canvas */
    onInsertRef?: (entity: Entity) => void
    /** Canvas ref for in-memory patching after project-wide ops */
    canvasRef?: React.RefObject<{ patchEntityRefsForReplace: (from: string, to: string) => number; removeEntityRefs: (id: string) => number } | null>
}

// ── Component ──

export function EntityLibrary({ projectId, onClose, onInsertRef, canvasRef }: EntityLibraryProps) {
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

    // ── Delete (cascade: entity row + all refs) ──

    const [deleteTarget, setDeleteTarget] = useState<Entity | null>(null)
    const [deleteUsage, setDeleteUsage] = useState<EntityRefUsage | null>(null)
    const [deleteScanning, setDeleteScanning] = useState(false)
    const [deleteBusy, setDeleteBusy] = useState(false)
    const [toast, setToast] = useState<string | null>(null)

    const showToast = (msg: string) => {
        setToast(msg)
        setTimeout(() => setToast(null), 5000)
    }

    const handleDelete = async (entityId: string) => {
        const entity = entities.find(e => e.id === entityId)
        if (!entity) return
        setDeleteTarget(entity)
        setDeleteUsage(null)
        setDeleteScanning(true)
        const usage = await countEntityRefsInProjectAction(projectId, entityId)
        setDeleteUsage(usage)
        setDeleteScanning(false)
    }

    const confirmDeleteCascade = async () => {
        if (!deleteTarget || !deleteUsage || deleteBusy) return
        setDeleteBusy(true)
        const result = await deleteEntityCascadeAction(deleteTarget.id, deleteUsage.affectedTakeIds)
        if (result.success) {
            setEntities(prev => prev.filter(e => e.id !== deleteTarget.id))
            invalidateEntityCache(deleteTarget.id)
            bumpEntityVersion()
            // Patch current take in-memory so user sees change immediately
            canvasRef?.current?.removeEntityRefs(deleteTarget.id)
            showToast(`Deleted "${deleteTarget.name}" — removed ${result.removedRefs} ref${result.removedRefs !== 1 ? 's' : ''} across ${deleteUsage.affectedTakes} take${deleteUsage.affectedTakes !== 1 ? 's' : ''}.`)
        }
        setDeleteBusy(false)
        setDeleteTarget(null)
    }

    // ── Replace (standalone from Library row, or from delete modal) ──

    const [replaceSource, setReplaceSource] = useState<Entity | null>(null)
    const [replaceUsage, setReplaceUsage] = useState<EntityRefUsage | null>(null)
    const [replaceScanning, setReplaceScanning] = useState(false)
    const [replaceBusy, setReplaceBusy] = useState(false)

    const handleOpenReplace = async (entity: Entity) => {
        setReplaceSource(entity)
        setReplaceUsage(null)
        setReplaceScanning(true)
        const usage = await countEntityRefsInProjectAction(projectId, entity.id)
        setReplaceUsage(usage)
        setReplaceScanning(false)
    }

    /** Transition from delete modal → replace modal */
    const handleReplaceFromDelete = () => {
        if (!deleteTarget) return
        const entity = deleteTarget
        setDeleteTarget(null)
        handleOpenReplace(entity)
    }

    const confirmReplace = async (toEntity: Entity) => {
        if (!replaceSource || !replaceUsage || replaceBusy) return
        setReplaceBusy(true)
        const result = await replaceEntityRefsAction(
            replaceSource.id,
            toEntity.id,
            replaceUsage.affectedTakeIds
        )
        if (result.success) {
            invalidateEntityCache(replaceSource.id)
            invalidateEntityCache(toEntity.id)
            bumpEntityVersion()
            // Patch current take in-memory so user sees change immediately
            canvasRef?.current?.patchEntityRefsForReplace(replaceSource.id, toEntity.id)
            showToast(`Replaced ${result.replacedRefs} ref${result.replacedRefs !== 1 ? 's' : ''} of "${replaceSource.name}" → "${toEntity.name}".`)
        }
        setReplaceBusy(false)
        setReplaceSource(null)
    }

    // ── Filter ──

    const filtered = filterType === 'all'
        ? entities
        : entities.filter(e => e.entity_type === filterType)

    // ── Edit callback ──

    const handleEditSaved = (updated: Entity) => {
        setEntities(prev => prev.map(e => e.id === updated.id ? updated : e))
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
                                    {(Object.entries(ENTITY_TYPE_UI) as [EntityType, { label: string }][]).map(([k, v]) => (
                                        <option key={k} value={k}>{v.label}</option>
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
                        {(Object.entries(ENTITY_TYPE_UI) as [EntityType, { label: string }][]).map(([k, v]) => (
                            <button
                                key={k}
                                onClick={() => setFilterType(k)}
                                className={`px-2 py-0.5 text-[10px] rounded transition-colors ${filterType === k ? 'bg-zinc-700 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`}
                            >
                                {v.label}
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
                                        onReplace={() => handleOpenReplace(entity)}
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

            {/* ═══ Delete Entity Modal (cascade) ═══ */}
            {deleteTarget && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60" onClick={() => { if (!deleteBusy) setDeleteTarget(null) }}>
                    <div className="bg-zinc-900 border border-zinc-600 rounded-lg px-6 py-5 w-96 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-sm font-semibold text-zinc-100 mb-1">Delete "{deleteTarget.name}"?</h3>

                        {deleteScanning ? (
                            <p className="text-[11px] text-zinc-500 mb-4">Scanning project…</p>
                        ) : deleteUsage && deleteUsage.totalRefs > 0 ? (
                            <p className="text-[11px] text-zinc-500 mb-4">
                                This will remove the entity and <span className="text-zinc-300 font-medium">{deleteUsage.totalRefs} reference{deleteUsage.totalRefs !== 1 ? 's' : ''}</span> across <span className="text-zinc-300 font-medium">{deleteUsage.affectedTakes} take{deleteUsage.affectedTakes !== 1 ? 's' : ''}</span>. This cannot be undone.
                            </p>
                        ) : (
                            <p className="text-[11px] text-zinc-500 mb-4">No references found. The entity will be deleted.</p>
                        )}

                        <div className="flex items-center gap-2 justify-between">
                            <div className="flex items-center gap-2">
                                {deleteUsage && deleteUsage.totalRefs > 0 && (
                                    <button
                                        onClick={handleReplaceFromDelete}
                                        disabled={deleteBusy || deleteScanning}
                                        className="px-3 py-1.5 text-[10px] rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                                    >
                                        Replace instead…
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setDeleteTarget(null)}
                                    disabled={deleteBusy}
                                    className="px-3 py-1.5 text-[10px] rounded bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmDeleteCascade}
                                    disabled={deleteBusy || deleteScanning}
                                    className="px-3 py-1.5 text-[10px] rounded bg-red-600/80 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
                                >
                                    {deleteBusy ? 'Deleting…' : 'Delete'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ Replace Entity Modal ═══ */}
            {replaceSource && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60" onClick={() => { if (!replaceBusy) setReplaceSource(null) }}>
                    <div className="bg-zinc-900 border border-zinc-600 rounded-lg px-6 py-5 w-96 max-h-[70vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-sm font-semibold text-zinc-100 mb-1">Replace "{replaceSource.name}"</h3>

                        {replaceScanning ? (
                            <p className="text-[11px] text-zinc-500 mb-3">Scanning project…</p>
                        ) : replaceUsage && replaceUsage.totalRefs > 0 ? (
                            <p className="text-[11px] text-zinc-500 mb-3">
                                This affects <span className="text-zinc-300 font-medium">{replaceUsage.totalRefs} reference{replaceUsage.totalRefs !== 1 ? 's' : ''}</span> across <span className="text-zinc-300 font-medium">{replaceUsage.affectedTakes} take{replaceUsage.affectedTakes !== 1 ? 's' : ''}</span>. "{replaceSource.name}" stays in library.
                            </p>
                        ) : (
                            <p className="text-[11px] text-zinc-500 mb-3">No references found in project.</p>
                        )}

                        <p className="text-[10px] text-zinc-600 mb-2">Select replacement:</p>

                        <div className="flex-1 overflow-y-auto space-y-1 min-h-0 max-h-60">
                            {entities
                                .filter(e => e.id !== replaceSource.id)
                                .map(e => (
                                    <button
                                        key={e.id}
                                        onClick={() => confirmReplace(e)}
                                        disabled={replaceBusy || replaceScanning || !replaceUsage || replaceUsage.totalRefs === 0}
                                        className="w-full flex items-center gap-2 px-3 py-2 rounded bg-zinc-800/50 border border-zinc-700/50 hover:border-zinc-500 transition-colors text-left disabled:opacity-50"
                                    >
                                        <span className={`text-[8px] font-medium px-1.5 py-0.5 rounded border shrink-0 ${getEntityTypeUI(e.entity_type).badgeClass}`}>
                                            {getEntityTypeUI(e.entity_type).label}
                                        </span>
                                        <span className="text-[11px] text-zinc-200 truncate">{e.name}</span>
                                    </button>
                                ))
                            }
                            {entities.filter(e => e.id !== replaceSource.id).length === 0 && (
                                <p className="text-[10px] text-zinc-600 italic py-4 text-center">No other entities available</p>
                            )}
                        </div>

                        <div className="flex justify-end mt-4 pt-3 border-t border-zinc-800">
                            <button
                                onClick={() => setReplaceSource(null)}
                                disabled={replaceBusy}
                                className="px-3 py-1.5 text-[10px] rounded bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 transition-colors"
                            >
                                Cancel
                            </button>
                        </div>

                        {replaceBusy && <p className="text-[9px] text-zinc-600 italic mt-2 text-center">Replacing…</p>}
                    </div>
                </div>
            )}

            {/* ═══ Toast ═══ */}
            {toast && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] px-4 py-2 bg-zinc-800 border border-zinc-600 rounded-lg shadow-2xl text-[11px] text-zinc-200 pointer-events-none animate-fade-in">
                    {toast}
                </div>
            )}
        </>
    )
}

// ── Entity Row ──

function EntityRow({ entity, onEdit, onDelete, onReplace, onInsertRef }: {
    entity: Entity
    onEdit: () => void
    onDelete: () => void
    onReplace: () => void
    onInsertRef?: () => void
}) {
    const typeCfg = getEntityTypeUI(entity.entity_type)
    const { Icon: TypeIcon } = typeCfg
    const mediaCount = (entity.content as any)?.media?.length ?? 0
    const promptCount = (entity.content as any)?.prompts?.length ?? 0
    const description = (entity.content as any)?.description ?? ''
    const thumbnail = (entity.content as any)?.thumbnail_path

    return (
        <div className="group flex items-start gap-3 p-3 bg-zinc-800/40 border border-zinc-700/50 rounded-lg hover:border-zinc-600/60 transition-colors">
            {/* Thumbnail */}
            <div className="w-12 h-12 shrink-0 rounded bg-zinc-800 border border-zinc-700 flex items-center justify-center overflow-hidden">
                {thumbnail ? (
                    <img src={thumbnail} alt="" className="w-full h-full object-cover" />
                ) : (
                    <TypeIcon size={20} className={typeCfg.textClass} />
                )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium text-zinc-200 truncate">{entity.name}</span>
                    <span className={`text-[8px] font-medium px-1.5 py-0.5 rounded border shrink-0 ${typeCfg.badgeClass}`}>
                        {typeCfg.label}
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
                    onClick={onReplace}
                    className="px-2 py-1 text-[9px] rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors"
                    title="Replace references across project"
                >
                    ⇄
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