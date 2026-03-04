'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import Link from 'next/link'

import type { CanvasNode } from '@/components/canvas/TakeCanvas'
import {
    IMAGE_GENERATED_WITH_OPTIONS,
    VIDEO_GENERATED_WITH_OPTIONS,
    normalizeProvenanceValue,
} from '@/lib/provenance-options'

import { getEntityAction, type Entity } from '@/app/actions/entities'
import { getEntityUsageAction, type EntityUsageResult } from '@/app/actions/entity-ref-ops'
import { EntityPackPreview, normalizeMedia, normalizePrompts, normalizeNotes, getMediaUrl } from '@/components/entities/entity-pack-preview'
import { entityCache, invalidateEntityCache, useEntityVersion } from '@/lib/entities/entity-cache'
import { getEntityTypeUI } from '@/lib/entities/entity-type-ui'
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
    projectId?: string
}

// ── Component ──

export function InspectorPanel({ node, onClose, onUpdateNodeData, onOpenEntityEdit, projectId }: InspectorPanelProps) {

    const entityVersion = useEntityVersion()

    const filename = useMemo(() => node ? humanFilename(node.data as any) : null, [node])
    const dimensions = useMemo(() => node ? formatDimensions(node) : null, [node])
    const data = (node?.data ?? {}) as Record<string, any>

    const showGeneratedWith = node?.type === 'image' || node?.type === 'video'
    const showToolOrigin = node?.type === 'prompt'
    const isEntityRef = node?.type === 'entity_ref'

    const [fetchedEntity, setFetchedEntity] = useState<Entity | null>(null)
    const [entityLoading, setEntityLoading] = useState(false)

    // ── Where Used ──
    const [whereUsed, setWhereUsed] = useState<EntityUsageResult | null>(null)
    const [whereUsedLoading, setWhereUsedLoading] = useState(false)
    const [whereUsedOpen, setWhereUsedOpen] = useState(false)

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

    // ── Where Used fetch: triggered on entity change or cache invalidation ──
    useEffect(() => {
        if (!entityIdForFetch || !projectId) { setWhereUsed(null); return }
        setWhereUsedLoading(true)
        let cancelled = false
        getEntityUsageAction(entityIdForFetch, projectId).then(result => {
            if (!cancelled) { setWhereUsed(result); setWhereUsedLoading(false) }
        }).catch(() => { if (!cancelled) setWhereUsedLoading(false) })
        return () => { cancelled = true }
    }, [entityIdForFetch, projectId, entityVersion])

    return (
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

                    ) : isEntityRef ? (
                        /* ═══ Entity Ref layout ═══ */
                        <div className="space-y-3">
                            {/* Actions: top, always visible */}
                            {data.entity_id && onOpenEntityEdit && (
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => onOpenEntityEdit(data.entity_id)}
                                        className="flex-1 px-2 py-1.5 text-[10px] rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors text-center"
                                    >
                                        Edit Entity
                                    </button>
                                    {fetchedEntity && (
                                        <div className="flex-1">
                                            <DownloadEntityPackButton entity={fetchedEntity} />
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Separator */}
                            <div className="border-t border-zinc-800" />

                            {/* Badge + name: live from fetchedEntity, neutral while loading */}
                            {(() => {
                                if (entityLoading || (!fetchedEntity && data.entity_id)) {
                                    return (
                                        <div>
                                            <span className="text-[8px] font-medium px-1.5 py-0.5 rounded border inline-block mb-1.5 uppercase tracking-wider text-zinc-500 bg-zinc-800 border-zinc-700">…</span>
                                            <div className="text-[13px] text-zinc-500 font-semibold leading-tight truncate">Loading…</div>
                                        </div>
                                    )
                                }
                                if (!fetchedEntity) {
                                    return (
                                        <div>
                                            <span className="text-[8px] font-medium px-1.5 py-0.5 rounded border inline-block mb-1.5 uppercase tracking-wider text-red-400/60 bg-red-500/5 border-red-500/20">missing</span>
                                            <div className="text-[13px] text-zinc-400 font-semibold leading-tight truncate">{data.entity_name ?? 'Unknown'}</div>
                                        </div>
                                    )
                                }
                                const liveType = fetchedEntity.entity_type
                                const liveName = fetchedEntity.name
                                const typeCfg = getEntityTypeUI(liveType)
                                return (
                                    <div>
                                        <span className={`text-[8px] font-medium px-1.5 py-0.5 rounded border inline-block mb-1.5 uppercase tracking-wider ${typeCfg.badgeClass}`}>{liveType}</span>
                                        <div className="text-[13px] text-zinc-100 font-semibold leading-tight truncate">{liveName}</div>
                                    </div>
                                )
                            })()}

                            {/* Entity content: media, prompts (open), notes (closed) */}
                            {fetchedEntity && (
                                <EntityPackPreview
                                    content={fetchedEntity.content}
                                    variant="full"
                                    onImageClick={undefined}
                                    promptsDefaultOpen={true}
                                    notesDefaultOpen={false}
                                />
                            )}

                            {!entityLoading && !fetchedEntity && data.entity_id && (
                                <p className="text-[9px] text-zinc-600 italic">Entity data unavailable</p>
                            )}

                            {/* ── Where Used ── */}
                            {projectId && entityIdForFetch && (
                                <div className="border-t border-zinc-800/60 pt-2">
                                    <button
                                        onClick={() => setWhereUsedOpen(p => !p)}
                                        className="w-full flex items-center justify-between text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors py-1"
                                    >
                                        <span className="flex items-center gap-1.5">
                                            <span className="text-[7px]">{whereUsedOpen ? '▼' : '▶'}</span>
                                            {whereUsedLoading
                                                ? <span className="text-zinc-600">Used in …</span>
                                                : whereUsed
                                                    ? <span>Used in <span className="text-zinc-200 font-medium">{whereUsed.count}</span></span>
                                                    : <span className="text-zinc-600">Used in —</span>
                                            }
                                        </span>
                                    </button>

                                    {whereUsedOpen && whereUsed && (
                                        <div
                                            onPointerDownCapture={(e) => e.stopPropagation()}
                                            onPointerUpCapture={(e) => e.stopPropagation()}
                                            onClickCapture={(e) => e.stopPropagation()}
                                            className="mt-1 space-y-0.5"
                                        >
                                            {whereUsed.usages.length === 0 ? (
                                                <p className="text-[9px] text-zinc-600 italic pl-3">Not used anywhere</p>
                                            ) : whereUsed.usages.map(u => {
                                                const href = u.shot_id
                                                    ? `/projects/${projectId}/shots/${u.shot_id}?take=${u.take_id}`
                                                    : null
                                                if (!href) return (
                                                    <div key={u.take_id} className="px-2.5 py-1.5 rounded text-[10px] bg-zinc-800/20 border border-zinc-800 text-zinc-600 cursor-not-allowed">
                                                        <div className="leading-tight truncate">{u.shot_label}</div>
                                                        <div className="text-[9px] mt-0.5">{u.take_label} · no shot_id</div>
                                                    </div>
                                                )
                                                return (
                                                    <Link
                                                        key={u.take_id}
                                                        href={href}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="block w-full text-left px-2.5 py-1.5 rounded text-[10px] bg-zinc-800/40 hover:bg-zinc-700/50 border border-zinc-700/30 hover:border-zinc-600/40 transition-colors group cursor-pointer"
                                                    >
                                                        <div className="text-zinc-200 group-hover:text-white leading-tight truncate">
                                                            {u.scene_label && <span className="text-zinc-500">{u.scene_label} / </span>}
                                                            {u.shot_label}
                                                        </div>
                                                        <div className="text-[9px] text-zinc-600 leading-tight mt-0.5">
                                                            {u.take_label}{u.ref_count > 1 ? ` · ${u.ref_count} refs` : ''}
                                                        </div>
                                                    </Link>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Details (collapsed by default) */}
                            <DrawerCollapsible label="Details" defaultOpen={false}>
                                <div className="space-y-2">
                                    <Section label="Position">
                                        <Value>{Math.round(node.x)}, {Math.round(node.y)}</Value>
                                    </Section>
                                    <Section label="Node ID">
                                        <div className="flex items-center gap-1">
                                            <span className="text-[10px] text-zinc-600 font-mono truncate flex-1 select-text">{node.id}</span>
                                            <CopyButton text={node.id} size={10} />
                                        </div>
                                    </Section>
                                </div>
                            </DrawerCollapsible>
                        </div>

                    ) : (
                        /* ═══ Standard node layout (unchanged) ═══ */
                        <div className="space-y-4">
                            {/* Type */}
                            <Section label="Type">
                                <Value>{humanType(node)}</Value>
                                {node.type === 'prompt' && data.prompt_type && (
                                    <Value sub>{data.prompt_type}</Value>
                                )}
                            </Section>

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

                            {/* Provenance: Tool Origin (Prompt) */}
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

/** Collapsible with configurable default state — used for entity drawer sections */
function DrawerCollapsible({ label, defaultOpen = false, children }: { label: string; defaultOpen?: boolean; children: React.ReactNode }) {
    const [open, setOpen] = useState(defaultOpen)
    return (
        <div>
            <button
                onClick={() => setOpen(p => !p)}
                className="w-full text-[9px] text-zinc-600 uppercase tracking-wider py-1.5 flex items-center gap-1 hover:text-zinc-400 transition-colors border-t border-zinc-800/60"
            >
                <span className="text-[7px]">{open ? '▼' : '▶'}</span>
                {label}
            </button>
            {open && <div className="pb-1">{children}</div>}
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
            {busy ? '⏳ Packing…' : '📦 Download Pack'}
        </button>
    )
}