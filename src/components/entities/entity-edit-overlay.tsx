'use client'

import { useState, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
    updateEntityAction,
    type Entity,
    type EntityType,
    type EntityContent,
} from '@/app/actions/entities'

// ── Types ──

interface EntityEditOverlayProps {
    entity: Entity
    projectId: string
    onSave: (updated: Entity) => void
    onClose: () => void
}

const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
    character: 'Character',
    environment: 'Environment',
    prop: 'Prop',
    cinematography: 'Cinematography',
}

const PROMPT_TYPES = ['master', 'prompt', 'negative', 'pre-prompt', 'post-prompt'] as const
const ORIGIN_OPTIONS = ['Manual', 'ChatGPT', 'Claude', 'Gemini', 'Midjourney', 'Runway', 'Kling', 'Veo', 'ComfyUI'] as const

// ── Component ──

export function EntityEditOverlay({ entity, projectId, onSave, onClose }: EntityEditOverlayProps) {
    const content = (entity.content ?? {}) as EntityContent
    const [name, setName] = useState(entity.name)
    const [entityType, setEntityType] = useState<EntityType>(entity.entity_type)
    const [description, setDescription] = useState(content.description ?? '')
    const [media, setMedia] = useState<NonNullable<EntityContent['media']>>(content.media ?? [])
    const [prompts, setPrompts] = useState<NonNullable<EntityContent['prompts']>>(content.prompts ?? [])
    const [notes, setNotes] = useState<NonNullable<EntityContent['notes']>>(content.notes ?? [])
    const [provenance, setProvenance] = useState(content.provenance ?? {})
    const [saving, setSaving] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // ── Dirty detection ──

    const isDirty = useMemo(() => {
        const origContent = (entity.content ?? {}) as EntityContent
        if (name !== entity.name) return true
        if (entityType !== entity.entity_type) return true
        if (description !== (origContent.description ?? '')) return true
        if (JSON.stringify(provenance) !== JSON.stringify(origContent.provenance ?? {})) return true
        if (JSON.stringify(media) !== JSON.stringify(origContent.media ?? [])) return true
        if (JSON.stringify(prompts) !== JSON.stringify(origContent.prompts ?? [])) return true
        if (JSON.stringify(notes) !== JSON.stringify(origContent.notes ?? [])) return true
        return false
    }, [name, entityType, description, provenance, media, prompts, notes, entity])

    const handleClose = useCallback(() => {
        if (isDirty) {
            setShowDiscardConfirm(true)
        } else {
            onClose()
        }
    }, [isDirty, onClose])

    // ── Save ──

    const handleSave = useCallback(async () => {
        if (saving) return
        setSaving(true)

        const newContent: EntityContent = {
            description: description.trim() || undefined,
            media: media.length > 0 ? media : undefined,
            prompts: prompts.filter(p => p.body.trim()).length > 0 ? prompts.filter(p => p.body.trim()) : undefined,
            notes: notes.filter(n => n.body.trim()).length > 0 ? notes.filter(n => n.body.trim()) : undefined,
            provenance: Object.values(provenance).some(Boolean) ? provenance : undefined,
            thumbnail_path: media[0]?.storage_path ?? content.thumbnail_path,
        }

        if (process.env.NODE_ENV === 'development') console.log('[entity-edit] SAVE content media:', newContent.media?.length ?? 0)
        const updated = await updateEntityAction({
            entityId: entity.id,
            name: name.trim() || 'Untitled Entity',
            entityType,
            content: newContent,
        })

        if (process.env.NODE_ENV === 'development') console.log('[entity-edit] SAVE result:', updated?.id, 'media in result:', (updated?.content as any)?.media?.length ?? 0)
        if (updated) onSave(updated)
        setSaving(false)
    }, [entity.id, name, entityType, description, media, prompts, notes, provenance, content.thumbnail_path, saving, onSave])

    // ── Media upload ──

    const handleMediaUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (process.env.NODE_ENV === 'development') console.log('[entity-edit] handleMediaUpload ENTER, files:', e.target.files?.length ?? 0)
        const files = e.target.files
        if (!files || files.length === 0) return
        const fileList = Array.from(files)
        e.target.value = ''
        setUploading(true)

        const supabase = createClient()

        for (const file of fileList) {

            const isVideo = file.type.startsWith('video/')
            const bucket = isVideo ? 'take-videos' : 'take-images'
            const ext = file.name.split('.').pop() || (isVideo ? 'mp4' : 'png')
            const storagePath = `${projectId}/entities/${entity.id}/${crypto.randomUUID()}.${ext}`

            const { error } = await supabase.storage
                .from(bucket)
                .upload(storagePath, file, { cacheControl: '3600', upsert: false })

            if (error) {
                console.error('[entity-edit] upload error:', error)
                continue
            }
            console.log('[entity-edit] upload OK, path:', storagePath)

            const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(storagePath)

            setMedia(prev => [...prev, {
                storage_path: storagePath,
                bucket,
                display_name: file.name,
                mime_type: file.type,
                asset_type: isVideo ? 'video' : 'image',
            }])
        }

        setUploading(false)
    }, [projectId, entity.id])

    const removeMedia = (idx: number) => {
        setMediaDeleteConfirmIdx(idx)
    }
    const [mediaDeleteConfirmIdx, setMediaDeleteConfirmIdx] = useState<number | null>(null)
    const confirmRemoveMedia = () => {
        if (mediaDeleteConfirmIdx !== null) {
            setMedia(prev => prev.filter((_, i) => i !== mediaDeleteConfirmIdx))
            setMediaDeleteConfirmIdx(null)
        }
    }

    // ── Prompts ──

    const addPrompt = () => setPrompts(prev => [...prev, { body: '', promptType: 'prompt', origin: 'Manual' }])
    const updatePrompt = (idx: number, field: string, value: string) =>
        setPrompts(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p))
    const removePrompt = (idx: number) => setPrompts(prev => prev.filter((_, i) => i !== idx))

    // ── Notes ──

    const addNote = () => setNotes(prev => [...prev, { body: '' }])
    const updateNote = (idx: number, body: string) =>
        setNotes(prev => prev.map((n, i) => i === idx ? { body } : n))
    const removeNote = (idx: number) => setNotes(prev => prev.filter((_, i) => i !== idx))

    // ── Render ──

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70" onClick={handleClose}>
            <div
                className="bg-zinc-900 border border-zinc-600 rounded-lg w-[800px] max-w-[95vw] max-h-[85vh] flex flex-col shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
                    <div className="flex items-center gap-3">
                        <h2 className="text-sm font-semibold text-zinc-100">Edit Entity</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-3 py-1.5 text-[10px] rounded bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
                        >
                            {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={handleClose} className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors">✕</button>
                    </div>
                </div>

                {/* Body — scrollable */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

                    {/* Name + Type */}
                    <div className="flex items-center gap-3">
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Entity name…"
                            className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                        />
                        <select
                            value={entityType}
                            onChange={e => setEntityType(e.target.value as EntityType)}
                            className="bg-zinc-800 border border-zinc-700 rounded px-2.5 py-2 text-xs text-zinc-300 focus:outline-none"
                        >
                            {(Object.entries(ENTITY_TYPE_LABELS) as [EntityType, string][]).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                            ))}
                        </select>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1.5">Description</label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="Character description, environment details, etc."
                            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-xs text-zinc-300 placeholder-zinc-600 resize-none focus:outline-none focus:border-zinc-500"
                            rows={3}
                        />
                    </div>

                    {/* Media */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Media ({media.length})</label>
                            <button type="button" onClick={() => { if (fileInputRef.current) { fileInputRef.current.value = ''; fileInputRef.current.click() }; if (process.env.NODE_ENV === 'development') console.log('[entity-edit] upload click') }} className="px-2 py-0.5 text-[9px]
 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors">
                                {uploading ? '⏳ Uploading…' : '+ Upload'}
                            </button>
                            <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" onChange={(e) => { if (process.env.NODE_ENV === 'development') console.log('[entity-edit] input change files=', e.currentTarget.files?.length ?? 0); handleMediaUpload(e) }} style={{ display: 'none' }} />

                        </div>
                        {media.length > 0 && (
                            <div className="grid grid-cols-4 gap-2">
                                {media.map((m, i) => (
                                    <div key={i} className="group relative bg-zinc-800 border border-zinc-700 rounded overflow-hidden h-20">
                                        {m.asset_type === 'video' ? (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <span className="text-zinc-500 text-sm">▶</span>
                                            </div>
                                        ) : (
                                            <img
                                                src={(() => {
                                                    const supabase = createClient()
                                                    return supabase.storage.from(m.bucket).getPublicUrl(m.storage_path).data.publicUrl
                                                })()}
                                                alt={m.display_name}
                                                className="w-full h-full object-cover"
                                            />

                                        )}
                                        {m.display_name && <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-[7px] text-zinc-400 truncate">{m.display_name}</div>}

                                        <button
                                            onClick={() => removeMedia(i)}
                                            className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 w-4 h-4 bg-red-900/80 text-red-300 text-[8px] rounded flex items-center justify-center transition-opacity"
                                        >
                                            ✕
                                        </button>
                                        <span className="absolute bottom-0.5 left-0.5 text-[7px] text-zinc-500 bg-zinc-900/80 px-1 rounded truncate max-w-[90%]">
                                            {m.display_name}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Prompts */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Prompts ({prompts.length})</label>
                            <button
                                onClick={addPrompt}
                                className="px-2 py-0.5 text-[9px] rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
                            >
                                + Add Prompt
                            </button>
                        </div>
                        {prompts.map((p, i) => (
                            <div key={i} className="mb-2 bg-zinc-800/50 border border-zinc-700/50 rounded p-3">
                                <div className="flex items-center gap-2 mb-2">
                                    <select
                                        value={p.promptType ?? 'prompt'}
                                        onChange={e => updatePrompt(i, 'promptType', e.target.value)}
                                        className="bg-zinc-900 border border-zinc-700 rounded px-1.5 py-1 text-[10px] text-zinc-300 focus:outline-none"
                                    >
                                        {PROMPT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                    <select
                                        value={p.origin ?? 'Manual'}
                                        onChange={e => updatePrompt(i, 'origin', e.target.value)}
                                        className="bg-zinc-900 border border-zinc-700 rounded px-1.5 py-1 text-[10px] text-zinc-300 focus:outline-none"
                                    >
                                        {ORIGIN_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                    <button
                                        onClick={() => removePrompt(i)}
                                        className="ml-auto text-[9px] text-red-400/60 hover:text-red-400 transition-colors"
                                    >
                                        Remove
                                    </button>
                                </div>
                                <textarea
                                    value={p.body}
                                    onChange={e => updatePrompt(i, 'body', e.target.value)}
                                    placeholder="Prompt body…"
                                    className="w-full bg-zinc-900 border border-zinc-700/40 rounded px-2.5 py-2 text-[11px] text-zinc-300 placeholder-zinc-600 resize-none focus:outline-none"
                                    rows={3}
                                />
                            </div>
                        ))}
                    </div>

                    {/* Notes */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Notes ({notes.length})</label>
                            <button
                                onClick={addNote}
                                className="px-2 py-0.5 text-[9px] rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
                            >
                                + Add Note
                            </button>
                        </div>
                        {notes.map((n, i) => (
                            <div key={i} className="mb-2 flex gap-2">
                                <textarea
                                    value={n.body}
                                    onChange={e => updateNote(i, e.target.value)}
                                    placeholder="Note…"
                                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2.5 py-2 text-[11px] text-zinc-300 placeholder-zinc-600 resize-none focus:outline-none"
                                    rows={2}
                                />
                                <button
                                    onClick={() => removeNote(i)}
                                    className="text-[9px] text-red-400/60 hover:text-red-400 self-start mt-2 transition-colors"
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Provenance */}
                    <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1.5">Provenance</label>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <span className="text-[9px] text-zinc-600 block mb-0.5">Generated With</span>
                                <select
                                    value={provenance.generated_with ?? ''}
                                    onChange={e => setProvenance(prev => ({ ...prev, generated_with: e.target.value || undefined }))}
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-[10px] text-zinc-300 focus:outline-none"
                                >
                                    <option value="">—</option>
                                    {ORIGIN_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                            </div>
                            <div>
                                <span className="text-[9px] text-zinc-600 block mb-0.5">Tool Origin</span>
                                <select
                                    value={provenance.tool_origin ?? ''}
                                    onChange={e => setProvenance(prev => ({ ...prev, tool_origin: e.target.value || undefined }))}
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-[10px] text-zinc-300 focus:outline-none"
                                >
                                    <option value="">—</option>
                                    {ORIGIN_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Discard changes confirm */}
            {showDiscardConfirm && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60" onClick={() => setShowDiscardConfirm(false)}>
                    <div className="bg-zinc-900 border border-zinc-600 rounded-lg px-6 py-5 w-80 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-sm font-semibold text-zinc-100 mb-2">Discard changes?</h3>
                        <p className="text-[11px] text-zinc-500 mb-4">You have unsaved changes. Closing will discard them.</p>
                        <div className="flex items-center gap-2 justify-end">
                            <button
                                onClick={() => setShowDiscardConfirm(false)}
                                className="px-3 py-1.5 text-[10px] rounded bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 transition-colors"
                            >
                                Continue editing
                            </button>
                            <button
                                onClick={() => { setShowDiscardConfirm(false); onClose() }}
                                className="px-3 py-1.5 text-[10px] rounded bg-red-600/80 text-white hover:bg-red-600 transition-colors"
                            >
                                Discard
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete media confirm */}
            {mediaDeleteConfirmIdx !== null && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60" onClick={() => setMediaDeleteConfirmIdx(null)}>
                    <div className="bg-zinc-900 border border-zinc-600 rounded-lg px-6 py-5 w-80 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-sm font-semibold text-zinc-100 mb-2">Remove media?</h3>
                        <p className="text-[11px] text-zinc-500 mb-4">This media will be removed from the entity. You can re-upload it later, but the original file may be hard to recover.</p>
                        <div className="flex items-center gap-2 justify-end">
                            <button
                                onClick={() => setMediaDeleteConfirmIdx(null)}
                                className="px-3 py-1.5 text-[10px] rounded bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmRemoveMedia}
                                className="px-3 py-1.5 text-[10px] rounded bg-red-600/80 text-white hover:bg-red-600 transition-colors"
                            >
                                Remove
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}