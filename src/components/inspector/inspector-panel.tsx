'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'

import type { CanvasNode } from '@/components/canvas/TakeCanvas'
import {
    IMAGE_GENERATED_WITH_OPTIONS,
    VIDEO_GENERATED_WITH_OPTIONS,
    normalizeProvenanceValue,
} from '@/lib/provenance-options'

import { getEntityAction, type Entity } from '@/app/actions/entities'
import { EntityPackPreview, normalizeMedia, normalizePrompts, normalizeNotes, getMediaUrl } from '@/components/entities/entity-pack-preview'
import { entityCache, invalidateEntityCache, useEntityVersion } from '@/lib/entities/entity-cache'
// ── Helpers ──

function humanType(node: CanvasNode): string {
    switch (node.type) {
        case 'image': return 'Image'
        case 'video': return 'Video'
        case 'note': return 'Note'
        case 'column': return 'Column'
        case 'prompt': return 'Prompt'
        case 'entity_ref': return 'Entity Ref'
        default: return 'Node'
    }
}

function humanFilename(data: Record<string, any>): string | null {
    const sp = data.storage_path ?? data.storagePath ?? ''
    if (sp) {
        const parts = sp.split('/')
        return parts[parts.length - 1] || null
    }
    if (data.filename) return data.filename
    if (data.src) {
        try {
            const url = new URL(data.src)
            const segments = url.pathname.split('/')
            return segments[segments.length - 1] || null
        } catch { return null }
    }
    return null
}

function formatDimensions(node: CanvasNode): string | null {
    const d = node.data as any
    const nw = d.naturalWidth ?? d.width
    const nh = d.naturalHeight ?? d.height
    if (typeof nw === 'number' && typeof nh === 'number' && nw > 0 && nh > 0) {
        const ar = nw / nh
        const arLabel = ar >= 1
            ? `${ar.toFixed(2)}:1`
            : `1:${(1 / ar).toFixed(2)}`
        return `${nw} × ${nh}  (${arLabel})`
    }
    if (node.width > 0 && node.height > 0) {
        return `${Math.round(node.width)} × ${Math.round(node.height)} (canvas)`
    }
    return null
}

function frameRoleLabel(data: Record<string, any>): string {
    const fr = data.frame_role
    if (fr === 'first') return 'FF (First Frame)'
    if (fr === 'last') return 'LF (Last Frame)'
    return '—'
}

function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).catch(() => { })
}

// ── Types ──

interface InspectorPanelProps {
    node: CanvasNode | null
    onClose: () => void
    onUpdateNodeData?: (nodeId: string, patch: Record<string, any>) => void
    onOpenEntityEdit?: (entityId: string) => void
}

// ── Component ──

export function InspectorPanel({ node, onClose, onUpdateNodeData, onOpenEntityEdit }: InspectorPanelProps) {

    const entityVersion = useEntityVersion()

    const filename = useMemo(() => node ? humanFilename(node.data as any) : null, [node])
    const dimensions = useMemo(() => node ? formatDimensions(node) : null, [node])
    const data = (node?.data ?? {}) as Record<string, any>

    const showGeneratedWith = node?.type === 'image' || node?.type === 'video'
    const showToolOrigin = node?.type === 'prompt'
    const isEntityRef = node?.type === 'entity_ref'

    const [fetchedEntity, setFetchedEntity] = useState<Entity | null>(null)
    const [entityLoading, setEntityLoading] = useState(false)
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

    // entityVersion bumps when parent signals cache invalidation
    const entityIdForFetch = isEntityRef ? (data.entity_id as string | undefined) : undefined

    useEffect(() => {
        if (!entityIdForFetch) { setFetchedEntity(null); return }
        const cached = entityCache.get(entityIdForFetch)
        if (cached) { setFetchedEntity(cached); setEntityLoading(false); return }
        setEntityLoading(true)
        setFetchedEntity(null)
        let cancelled = false
        getEntityAction(entityIdForFetch).then(e => {
            if (cancelled) return
            if (e) { entityCache.set(entityIdForFetch, e); setFetchedEntity(e) }
            setEntityLoading(false)
        }).catch(() => { if (!cancelled) setEntityLoading(false) })
        return () => { cancelled = true }
    }, [entityIdForFetch, entityVersion])

    return (
        <>
            {/* Lightbox — rendered outside drawer to avoid transform/overflow clipping */}
            {lightboxUrl && (
                <LightboxOverlay url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
            )}
            <div className="absolute top-0 right-0 bottom-0 w-72 z-30 pointer-events-none">
                <div className="h-full pointer-events-auto bg-zinc-900/95 border-l border-zinc-700/60 backdrop-blur-sm flex flex-col shadow-2xl">
                    {/* Header */}
                    <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-700/60">
                        <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Inspector</span>
                        <button
                            onClick={onClose}
                            className="w-6 h-6 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700/60 transition-colors"
                            title="Close (I)"
                        >
                            ×
                        </button>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto px-3 py-3">
                        {!node ? (
                            <p className="text-xs text-zinc-600 italic">Select a node to inspect</p>
                        ) : (
                            <div className="space-y-4">
                                {/* Type — hidden for entity_ref (has its own badge header) */}
                                {!isEntityRef && (
                                    <Section label="Type">
                                        <Value>{humanType(node)}</Value>
                                        {node.type === 'prompt' && data.prompt_type && (
                                            <Value sub>{data.prompt_type}</Value>
                                        )}
                                    </Section>
                                )}

                                {/* Filename */}
                                {(node.type === 'image' || node.type === 'video') && (
                                    <Section label="File">
                                        <div className="flex items-center gap-1.5">
                                            <Value className="truncate flex-1">{filename ?? '—'}</Value>
                                        </div>
                                    </Section>
                                )}

                                {/* Dimensions / AR */}
                                {(node.type === 'image' || node.type === 'video') && (
                                    <Section label="Dimensions">
                                        <Value>{dimensions ?? '—'}</Value>
                                    </Section>
                                )}

                                {/* Frame Role */}
                                {node.type === 'image' && (
                                    <Section label="Frame Role">
                                        <Value>{frameRoleLabel(data)}</Value>
                                    </Section>
                                )}

                                {/* Provenance: Generated With (Image/Video) */}
                                {showGeneratedWith && (
                                    <Section label="Generated With">
                                        <ProvenanceSelect
                                            value={data.generated_with ?? ''}
                                            options={node!.type === 'video' ? VIDEO_GENERATED_WITH_OPTIONS as unknown as string[] : IMAGE_GENERATED_WITH_OPTIONS as unknown as string[]}
                                            placeholder="Unknown"
                                            nodeId={node!.id}
                                            field="generated_with"
                                            onUpdate={onUpdateNodeData}
                                        />
                                    </Section>
                                )}

                                {/* Provenance: Tool Origin (Prompt) — read-only, edit surface is on the node itself */}
                                {showToolOrigin && (
                                    <Section label="Tool Origin">
                                        <div className="flex items-center gap-1">
                                            <Value className="flex-1">{normalizeProvenanceValue(data.origin ?? '') || '—'}</Value>
                                            {data.origin && <CopyButton text={normalizeProvenanceValue(data.origin)} size={10} />}
                                        </div>
                                    </Section>
                                )}

                                {/* Source */}
                                {(data.storage_path || data.src) && (
                                    <Section label="Source">
                                        <div className="flex items-start gap-1">
                                            <span className="text-[11px] text-zinc-400 break-all flex-1 select-text">
                                                {data.storage_path || data.src}
                                            </span>
                                            <CopyButton text={data.storage_path || data.src} />
                                        </div>
                                    </Section>
                                )}
                                {/* Entity Ref Pack */}
                                {isEntityRef && (() => {
                                    const liveType = fetchedEntity?.entity_type ?? data.entity_type
                                    const liveName = fetchedEntity?.name ?? data.entity_name ?? 'Unnamed'
                                    return (
                                        <>
                                            <div className="mb-2">
                                                <span className={`text-[8px] font-medium px-1.5 py-0.5 rounded border inline-block mb-1 ${liveType === 'character' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
                                                        liveType === 'environment' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                                                            liveType === 'prop' ? 'text-blue-400 bg-blue-500/10 border-blue-500/20' :
                                                                liveType === 'cinematography' ? 'text-purple-400 bg-purple-500/10 border-purple-500/20' :
                                                                    'text-zinc-400 bg-zinc-800 border-zinc-700'
                                                    }`}>{liveType ?? '—'}</span>
                                                <div className="text-[12px] text-zinc-200 font-semibold truncate">{liveName}</div>
                                            </div>

                                            {entityLoading && <p className="text-[10px] text-zinc-600 italic">Loading…</p>}

                                            {fetchedEntity && <EntityPackPreview content={fetchedEntity.content} variant="full" onImageClick={setLightboxUrl} />}

                                            {!entityLoading && !fetchedEntity && data.entity_id && (
                                                <p className="text-[9px] text-zinc-600 italic">Entity data unavailable</p>
                                            )}

                                            {data.entity_id && onOpenEntityEdit && (
                                                <div className="pt-2 space-y-1.5">
                                                    <button onClick={() => onOpenEntityEdit(data.entity_id)} className="w-full px-2 py-1.5 text-[10px] rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors text-center">
                                                        Edit Entity
                                                    </button>
                                                    {fetchedEntity && (
                                                        <DownloadEntityPackButton entity={fetchedEntity} />
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )
                                })()}
                                {/* Canvas position */}
                                <Section label="Position">
                                    <Value>{Math.round(node.x)}, {Math.round(node.y)}</Value>
                                </Section>

                                {/* Node ID */}
                                <Section label="Node ID">
                                    <div className="flex items-center gap-1">
                                        <span className="text-[10px] text-zinc-600 font-mono truncate flex-1 select-text">{node.id}</span>
                                        <CopyButton text={node.id} size={10} />
                                    </div>
                                </Section>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    )
}

// ── Sub-components ──

function Section({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-0.5">{label}</div>
            {children}
        </div>
    )
}

function Value({ children, sub, className }: { children: React.ReactNode; sub?: boolean; className?: string }) {
    return (
        <div className={`text-[11px] ${sub ? 'text-zinc-500 italic' : 'text-zinc-300'} ${className ?? ''}`}>
            {children}
        </div>
    )
}
function CollapsibleSection({ label, children }: { label: string; children: React.ReactNode }) {
    const [open, setOpen] = useState(false)
    return (
        <div>
            <button onClick={() => setOpen(p => !p)} className="text-[10px] text-zinc-600 uppercase tracking-wider mb-0.5 flex items-center gap-1 hover:text-zinc-400 transition-colors">
                <span className="text-[8px]">{open ? '▼' : '▶'}</span>{label}
            </button>
            {open && <div className="pl-2 border-l border-zinc-800 mt-1">{children}</div>}
        </div>
    )
}

function CopyButton({ text, size = 12 }: { text: string; size?: number }) {
    return (
        <button
            onClick={() => copyToClipboard(text)}
            className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700/60 transition-colors"
            title="Copy"
        >
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
        </button>
    )
}

// ── Provenance dropdown with custom input ──

interface ProvenanceSelectProps {
    value: string
    options: string[]
    placeholder: string
    nodeId: string
    field: string
    onUpdate?: (nodeId: string, patch: Record<string, any>) => void
}

function ProvenanceSelect({ value, options, placeholder, nodeId, field, onUpdate }: ProvenanceSelectProps) {
    // Normalize incoming value: 'manual' → 'Manual', 'chatgpt' → 'ChatGPT', etc.
    const normalized = normalizeProvenanceValue(value ?? '')
    const isKnown = normalized !== '' && options.includes(normalized as any)
    const isCustom = normalized !== '' && !isKnown

    const [showCustom, setShowCustom] = useState(isCustom)
    const [customText, setCustomText] = useState(isCustom ? normalized : '')

    // If the stored value is a known alias but not canonical, auto-fix on mount
    // e.g. 'manual' → 'Manual' — write once silently
    const didAutoFix = useMemo(() => {
        if (isKnown && normalized !== (value ?? '').trim() && onUpdate) {
            onUpdate(nodeId, { [field]: normalized })
            return true
        }
        return false
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []) // only on mount

    const handleSelectChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        const v = e.target.value
        if (v === '__custom__') {
            setShowCustom(true)
            setCustomText(isCustom ? normalized : '')
            return
        }
        setShowCustom(false)
        setCustomText('')
        // '' means clear → store empty string (consistent: empty = unset)
        onUpdate?.(nodeId, { [field]: v || '' })
    }, [nodeId, field, onUpdate, isCustom, normalized])

    const handleCustomBlur = useCallback(() => {
        const trimmed = customText.trim()
        if (trimmed) {
            // If user typed a known tool name, normalize to canonical
            const resolved = normalizeProvenanceValue(trimmed)
            const resolvedIsKnown = options.includes(resolved as any)
            if (resolvedIsKnown) {
                setShowCustom(false)
                setCustomText('')
            }
            onUpdate?.(nodeId, { [field]: resolved })
        } else {
            // Cleared custom → revert to unknown
            setShowCustom(false)
            onUpdate?.(nodeId, { [field]: '' })
        }
    }, [customText, nodeId, field, onUpdate, options])

    const handleCustomKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault()
                ; (e.target as HTMLInputElement).blur()
        }
        // Stop propagation so canvas shortcuts (I, Delete, etc.) don't fire
        e.stopPropagation()
    }, [])

    // Determine select value — use normalized form for matching
    const selectValue = showCustom ? '__custom__' : (isKnown ? normalized : (normalized ? '__custom__' : ''))

    // Sync showCustom when value changes externally (e.g. undo)
    useMemo(() => {
        if (isCustom && !showCustom) {
            setShowCustom(true)
            setCustomText(normalized)
        } else if (isKnown && showCustom) {
            setShowCustom(false)
            setCustomText('')
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [normalized])

    return (
        <div className="space-y-1">
            <select
                value={selectValue}
                onChange={handleSelectChange}
                onKeyDown={e => e.stopPropagation()}
                className="w-full text-[11px] bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-300 outline-none focus:border-zinc-500 transition-colors appearance-none cursor-pointer"
            >
                <option value="">{placeholder}</option>
                {options.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                ))}
                <option value="__custom__">Custom…</option>
            </select>
            {showCustom && (
                <input
                    type="text"
                    value={customText}
                    onChange={e => setCustomText(e.target.value)}
                    onBlur={handleCustomBlur}
                    onKeyDown={handleCustomKeyDown}
                    placeholder="Enter tool name…"
                    autoFocus
                    className="w-full text-[11px] bg-zinc-800 border border-zinc-600 rounded px-1.5 py-1 text-zinc-300 outline-none focus:border-zinc-400 placeholder:text-zinc-600 transition-colors"
                />
            )}
        </div>
    )
}

// ── Download Entity Pack ZIP ──

function formatEntityPackText(entity: Entity): string {
    const c = entity.content as any
    const lines: string[] = []

    lines.push(`ENTITY: ${entity.name}`)
    lines.push(`TYPE: ${entity.entity_type}`)
    if (c?.description) lines.push(`DESCRIPTION: ${c.description}`)
    lines.push('─'.repeat(40))

    const prompts = normalizePrompts(c?.prompts ?? [])
    if (prompts.length > 0) {
        lines.push('', 'PROMPTS', '─'.repeat(40))
        prompts.forEach((p, i) => {
            lines.push(``, `#${i + 1}  |  ${p.promptType}  |  Origin: ${p.origin}`)
            if (p.title) lines.push(`Title: ${p.title}`)
            lines.push(p.body, '─'.repeat(40))
        })
    }

    const notes = normalizeNotes(c?.notes ?? [])
    if (notes.length > 0) {
        lines.push('', 'NOTES', '─'.repeat(40))
        notes.forEach((n, i) => { lines.push(`#${i + 1}: ${n.body}`) })
    }

    return lines.join('\n')
}

function DownloadEntityPackButton({ entity }: { entity: Entity }) {
    const [busy, setBusy] = useState(false)

    const handleDownload = useCallback(async () => {
        if (busy) return
        setBusy(true)

        const c = entity.content as any
        const media = normalizeMedia(c?.media ?? [])

        const assets = media.map((m, i) => ({
            nodeId: `entity-media-${i}`,
            type: m.kind,
            bucket: m.kind === 'video' ? 'take-videos' : 'take-images',
            storagePath: m.storage_path,
            originalFilename: m.filename || `media-${i}`,
            exportName: m.filename || `media-${i}`,
            role: 'ref' as const,
        }))

        const promptFileText = formatEntityPackText(entity)
        const zipName = `entity-${entity.name.replace(/[^a-zA-Z0-9]/g, '_')}-pack`

        try {
            const resp = await fetch('/api/export-pack', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'pack', assets, promptFileText, zipName }),
            })
            if (!resp.ok) {
                console.error('[entity-pack] export failed:', resp.status)
                setBusy(false)
                return
            }
            const blob = await resp.blob()
            if (blob.size === 0) { setBusy(false); return }

            const cd = resp.headers.get('content-disposition') ?? ''
            const fnMatch = cd.match(/filename="?([^";\s]+)"?/)
            const filename = fnMatch?.[1] ?? `${zipName}.zip`

            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url; a.download = filename; a.style.display = 'none'
            document.body.appendChild(a); a.click()
            setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 100)
        } catch (err) {
            console.error('[entity-pack] download error:', err)
        }
        setBusy(false)
    }, [entity, busy])

    return (
        <button
            onClick={handleDownload}
            disabled={busy}
            className="w-full px-2 py-1.5 text-[10px] rounded bg-zinc-700/60 border border-zinc-600/40 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 disabled:opacity-50 transition-colors text-center"
        >
            {busy ? '⏳ Packing…' : '📦 Download Entity Pack'}
        </button>
    )
}

// ── Lightbox with zoom/pan ──

function LightboxOverlay({ url, onClose }: { url: string; onClose: () => void }) {
    const [scale, setScale] = useState(1)
    const [tx, setTx] = useState(0)
    const [ty, setTy] = useState(0)
    const [panning, setPanning] = useState(false)
    const panStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 })
    const containerRef = useRef<HTMLDivElement>(null)
    const backdropRef = useRef<HTMLDivElement>(null)

    // Focus for ESC
    useEffect(() => { backdropRef.current?.focus() }, [])

    // Wheel handler (passive: false for preventDefault)
    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        const handler = (e: WheelEvent) => {
            if (!e.ctrlKey && !e.metaKey) return
            e.preventDefault()
            const delta = -e.deltaY * 0.01
            setScale(prev => Math.min(4, Math.max(1, prev + delta)))
        }
        el.addEventListener('wheel', handler, { passive: false })
        return () => el.removeEventListener('wheel', handler)
    }, [])

    // Reset pan when scale returns to 1
    useEffect(() => {
        if (scale <= 1) { setTx(0); setTy(0) }
    }, [scale])

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (scale <= 1) return
        e.preventDefault()
        setPanning(true)
        panStart.current = { x: e.clientX, y: e.clientY, tx, ty }
    }, [scale, tx, ty])

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!panning) return
        const dx = e.clientX - panStart.current.x
        const dy = e.clientY - panStart.current.y
        const maxPan = (scale - 1) * 300
        setTx(Math.min(maxPan, Math.max(-maxPan, panStart.current.tx + dx)))
        setTy(Math.min(maxPan, Math.max(-maxPan, panStart.current.ty + dy)))
    }, [scale, panning])

    const handleMouseUp = useCallback(() => {
        setPanning(false)
    }, [])

    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        if (scale > 1) {
            setScale(1); setTx(0); setTy(0)
        } else {
            setScale(2)
        }
    }, [scale])

    return (
        <div
            ref={backdropRef}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center"
            style={{ pointerEvents: 'auto' }}
            onClick={onClose}
            onKeyDown={e => { if (e.key === 'Escape') onClose() }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            tabIndex={-1}
        >
            <div
                ref={containerRef}
                className="relative"
                onClick={e => e.stopPropagation()}
                onMouseDown={handleMouseDown}
                onDoubleClick={handleDoubleClick}
                style={{
                    cursor: scale > 1 ? (panning ? 'grabbing' : 'grab') : 'default',
                    transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
                    transformOrigin: 'center',
                    transition: panning ? 'none' : 'transform 0.15s ease-out',
                }}
            >
                <img
                    src={url}
                    alt=""
                    className="max-w-[92vw] max-h-[92vh] object-contain rounded shadow-2xl select-none"
                    draggable={false}
                />
            </div>
            <button
                onClick={onClose}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-black/60 text-zinc-400 hover:text-white text-lg transition-colors"
            >✕</button>
        </div>
    )
}