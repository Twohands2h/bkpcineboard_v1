'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { EntityImageLightbox } from './entity-image-lightbox'

// ── Entity meta (optional — enables ENTITY.txt + MANIFEST.json in pack download) ──

export interface EntityMeta {
    id: string
    name: string
    type: string
    description?: string
}

// ── Pure text builders — no I/O, no URLs in text output ──

export function buildEntityTxt(
    meta: EntityMeta | undefined,
    media: NormalizedMedia[],
    prompts: NormalizedPrompt[],
    notes: NormalizedNote[],
): string {
    const SEP = '─'.repeat(40)
    const lines: string[] = []

    // Header
    if (meta) {
        lines.push(`name: ${meta.name}`)
        lines.push(`type: ${meta.type || 'unknown'}`)
        lines.push(`id:   ${meta.id}`)
        if (meta.description) lines.push(`description: ${meta.description}`)
    }
    lines.push(SEP)

    // Prompts
    if (prompts.length > 0) {
        lines.push('')
        lines.push('PROMPTS')
        lines.push(SEP)
        prompts.forEach((p, i) => {
            if (i > 0) lines.push('')
            lines.push(`Generated with: ${p.origin || '—'}`)
            if (p.title) lines.push(p.title)
            lines.push(p.body)
        })
    }

    // Media included
    if (media.length > 0) {
        lines.push('')
        lines.push('MEDIA INCLUDED')
        lines.push(SEP)
        media.forEach(m => {
            const gw = m.prov_generated_with ? `Generated: ${m.prov_generated_with}` : 'Generated: —'
            const origin = `Origin: ${m.prov_origin_label || 'Unknown'}`
            const note = m.prov_notes ? `  [${m.prov_notes}]` : ''
            lines.push(`${m.filename || 'unnamed'}  |  ${gw}  |  ${origin}${note}`)
        })
    }

    // Notes
    if (notes.length > 0) {
        lines.push('')
        lines.push('NOTES')
        lines.push(SEP)
        notes.forEach((n, i) => {
            if (i > 0) lines.push('')
            lines.push(n.body)
        })
    }

    return lines.join('\n')
}

export function buildManifestJson(meta: EntityMeta | undefined, media: NormalizedMedia[]): string {
    const manifest = {
        entity: meta
            ? { id: meta.id, name: meta.name, type: meta.type, description: meta.description ?? null }
            : null,
        media: media.map(m => ({
            filename: m.filename || 'unnamed',
            storage_path: m.storage_path || null,
            provenance: {
                generated_with: m.prov_generated_with || null,
                origin: m.prov_origin_label || 'Unknown',
                note: m.prov_notes || null,
            },
        })),
        exported_at: new Date().toISOString(),
    }
    return JSON.stringify(manifest, null, 2)
}

// ── Normalizers: handle both EntityContent shape AND Crystallize v1 shape ──

export interface NormalizedMedia {
    storage_path: string
    src: string
    filename: string
    kind: 'image' | 'video'
    generated_with: string       // legacy entity-level field
    // per-media provenance v2 (absent on pre-migration items — backward-compat)
    prov_generated_with: string  // '' if absent
    prov_origin_label: string    // 'Unknown' if absent
    prov_notes: string           // '' if absent
}

export interface NormalizedPrompt {
    title: string
    body: string
    origin: string
    promptType: string
}

export interface NormalizedNote {
    body: string
}

export function normalizeMedia(raw: any[]): NormalizedMedia[] {
    return (raw ?? []).map((m: any) => ({
        storage_path: m.storage_path ?? m.storagePath ?? '',
        src: m.src ?? '',
        filename: m.display_name ?? m.filename ?? m.name ?? '',
        kind: (m.kind ?? m.asset_type ?? (m.bucket === 'take-videos' ? 'video' : 'image')) as 'image' | 'video',
        generated_with: m.generated_with ?? '',
        prov_generated_with: m.provenance?.generated_with ?? '',
        prov_origin_label: m.provenance?.origin_label ?? 'Unknown',
        prov_notes: m.provenance?.notes ?? '',
    })).filter(m => m.storage_path || m.src)
}

export function normalizePrompts(raw: any[]): NormalizedPrompt[] {
    return (raw ?? []).map((p: any) => ({
        title: p.title ?? '',
        body: p.body ?? p.text ?? '',
        origin: p.origin ?? '',
        promptType: p.promptType ?? p.prompt_type ?? 'prompt',
    })).filter(p => (p.body ?? '').trim().length > 0)
}

export function normalizeNotes(raw: any[]): NormalizedNote[] {
    return (raw ?? []).map((n: any) => ({
        body: n.body ?? n.text ?? '',
    })).filter(n => (n.body ?? '').trim().length > 0)
}

export function getMediaUrl(m: NormalizedMedia): string {
    if (m.src) return m.src
    if (!m.storage_path) return ''
    const supabase = createClient()
    const bucket = m.kind === 'video' ? 'take-videos' : 'take-images'
    return supabase.storage.from(bucket).getPublicUrl(m.storage_path).data.publicUrl
}

// ── Copy helper ──
function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).catch(() => { })
}

// ── Component ──

interface EntityPackPreviewProps {
    content: any
    /** Optional entity metadata — enables ENTITY.txt + MANIFEST.json in pack download */
    entity?: EntityMeta
    /** 'compact' = small thumbs (default), 'full' = full-width media for inspector drawer */
    variant?: 'compact' | 'full'
    /** Called when user clicks a media thumbnail (for external lightbox) */
    onImageClick?: (url: string) => void
    /** Override default open state for Prompts section */
    promptsDefaultOpen?: boolean
    /** Override default open state for Notes section */
    notesDefaultOpen?: boolean
}

export function EntityPackPreview({ content, entity, variant = 'compact', onImageClick, promptsDefaultOpen, notesDefaultOpen }: EntityPackPreviewProps) {
    const [resolutions, setResolutions] = useState<Record<number, string>>({})
    const [lightbox, setLightbox] = useState<{ src: string; filename: string } | null>(null)
    const [packBusy, setPackBusy] = useState(false)

    // Image click: use provided handler, otherwise open portal lightbox
    const handleImageClick = (url: string, filename: string) => {
        if (onImageClick) { onImageClick(url) }
        else { setLightbox({ src: url, filename }) }
    }

    // Programmatic blob download — no <a href>, no new tab
    const handleDownload = async (e: React.MouseEvent, m: NormalizedMedia) => {
        e.preventDefault()
        e.stopPropagation()
        const url = getMediaUrl(m)
        if (!url) return
        try {
            const resp = await fetch(url)
            const blob = await resp.blob()
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = m.filename || 'download'
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(a.href)
        } catch {
            window.open(url, '_blank')
        }
    }

    // Pack download — all media + ENTITY.txt + MANIFEST.json via /api/export-pack
    const handlePackDownload = async () => {
        if (packBusy) return
        setPackBusy(true)
        try {
            const supabase = createClient()
            const mediaItems = normalizeMedia(content.media)
            const promptItems = normalizePrompts(content.prompts)
            const noteItems = normalizeNotes(content.notes)

            // Build asset descriptors for route (media with storage_path only)
            const assets = mediaItems
                .filter(m => m.storage_path)
                .map((m, i) => ({
                    nodeId: `entity-media-${i}`,
                    type: m.kind,
                    bucket: m.kind === 'video' ? 'take-videos' : 'take-images',
                    storagePath: m.storage_path,
                    originalFilename: m.filename || `media-${i + 1}`,
                    exportName: m.filename || `media-${i + 1}`,
                    role: 'attachment' as const,
                }))

            if (assets.length === 0) return

            // Build text files
            const entityTxt = buildEntityTxt(entity, mediaItems, promptItems, noteItems)
            const manifestJson = buildManifestJson(entity, mediaItems)

            // Build 00_prompt.txt (prompts + notes only — no entity header)
            const promptLines: string[] = []
            const SEP = '─'.repeat(40)
            if (promptItems.length > 0) {
                promptItems.forEach((p, i) => {
                    if (i > 0) promptLines.push('', SEP, '')
                    promptLines.push(`PROMPT #${i + 1}  |  ${p.promptType || 'prompt'}  |  Generated with: ${p.origin || '—'}`)
                    promptLines.push(SEP)
                    if (p.title) promptLines.push(p.title)
                    promptLines.push(p.body)
                })
            }
            if (noteItems.length > 0) {
                if (promptLines.length > 0) promptLines.push('', SEP, '')
                promptLines.push('NOTES', SEP)
                noteItems.forEach((n, i) => {
                    if (i > 0) promptLines.push('')
                    promptLines.push(n.body)
                })
            }

            const zipName = entity ? `entity_${entity.name.replace(/\s+/g, '-').toLowerCase()}.zip` : 'entity-pack.zip'

            const payload = {
                mode: 'pack',
                assets,
                promptFileText: promptLines.length > 0 ? promptLines.join('\n') : undefined,
                zipName,
                extraTextFiles: [
                    { path: 'ENTITY.txt', content: entityTxt },
                    { path: 'MANIFEST.json', content: manifestJson },
                ],
            }

            const resp = await fetch('/api/export-pack', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })

            if (!resp.ok) {
                console.error('[entity-pack] export failed:', resp.status)
                return
            }

            const blob = await resp.blob()
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = zipName
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(a.href)
        } catch (err) {
            console.error('[entity-pack] download error:', err)
        } finally {
            setPackBusy(false)
        }
    }

    if (!content || typeof content !== 'object') {
        return <p className="text-[10px] text-zinc-600 italic">No content</p>
    }

    const media = normalizeMedia(content.media)
    const prompts = normalizePrompts(content.prompts)
    const notes = normalizeNotes(content.notes)

    const hasAnything = media.length > 0 || prompts.length > 0 || notes.length > 0
    if (!hasAnything) {
        return <p className="text-[10px] text-zinc-600 italic">Empty pack</p>
    }

    return (
        <div className="space-y-3">
            {/* Media */}
            {media.length > 0 && (
                <div>
                    <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Media ({media.length})</div>
                    {variant === 'full' ? (
                        <div className="space-y-2">
                            {media.map((m, i) => (
                                <div key={i} className="bg-zinc-800 border border-zinc-700 rounded overflow-hidden">
                                    {m.kind === 'video' ? (
                                        <div className="w-full h-32 flex items-center justify-center text-zinc-500 text-lg">▶</div>
                                    ) : (
                                        <img
                                            src={getMediaUrl(m)}
                                            alt={m.filename}
                                            className="w-full object-contain max-h-48 bg-zinc-900 cursor-pointer hover:opacity-90 transition-opacity"
                                            onClick={() => handleImageClick(getMediaUrl(m), m.filename)}
                                            onLoad={(e) => {
                                                const img = e.target as HTMLImageElement
                                                if (img.naturalWidth && !resolutions[i]) {
                                                    setResolutions(prev => ({ ...prev, [i]: `${img.naturalWidth}×${img.naturalHeight}` }))
                                                }
                                            }}
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                                        />
                                    )}
                                    <div className="px-2 py-1 flex items-center justify-between">
                                        <div className="flex items-center gap-1.5 truncate flex-1">
                                            <span className="text-[9px] text-zinc-500 truncate">{m.filename || 'unnamed'}</span>
                                            {resolutions[i] && <span className="text-[8px] text-zinc-600 shrink-0">{resolutions[i]}</span>}
                                        </div>
                                        {(m.storage_path || m.src) && (
                                            <button
                                                onClick={(e) => handleDownload(e, m)}
                                                className="text-[8px] text-zinc-600 hover:text-zinc-400 transition-colors ml-1 shrink-0"
                                                title="Download"
                                            >
                                                ⬇
                                            </button>
                                        )}
                                    </div>
                                    {/* Per-media provenance — shown only when any field is set */}
                                    {(m.prov_generated_with || m.prov_origin_label !== 'Unknown' || m.prov_notes) && (
                                        <div className="px-2 pb-1.5 space-y-0.5">
                                            {m.prov_generated_with && (
                                                <div className="text-[8px] text-zinc-600">
                                                    <span className="text-zinc-700">Generated: </span>{m.prov_generated_with}
                                                </div>
                                            )}
                                            <div className="text-[8px] text-zinc-600">
                                                <span className="text-zinc-700">Origin: </span>
                                                <span className="px-1 py-px rounded border border-zinc-700 bg-zinc-800/60">{m.prov_origin_label}</span>
                                                {m.prov_notes && <span className="text-zinc-700 ml-1">{m.prov_notes}</span>}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-wrap gap-1">
                            {media.map((m, i) => (
                                <div key={i} className="w-14 h-14 bg-zinc-800 border border-zinc-700 rounded overflow-hidden flex-shrink-0">
                                    {m.kind === 'video' ? (
                                        <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">▶</div>
                                    ) : (
                                        <img
                                            src={getMediaUrl(m)}
                                            alt={m.filename}
                                            className="w-full h-full object-cover"
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Prompts */}
            {prompts.length > 0 && (
                <CollapsibleSection label={`Prompts (${prompts.length})`} defaultOpen={promptsDefaultOpen ?? prompts.length <= 2}>
                    {prompts.map((p, i) => (
                        <div key={i} className="mb-2.5 last:mb-0">
                            <div className="flex items-center gap-1.5 mb-1">
                                {p.promptType && (
                                    <span className={`text-[8px] px-1.5 py-px rounded font-medium ${p.promptType.toLowerCase() === 'master' ? 'text-amber-400 bg-amber-500/10' :
                                            p.promptType.toLowerCase() === 'negative' ? 'text-red-400 bg-red-500/10' :
                                                'text-zinc-500 bg-zinc-800'
                                        }`}>{p.promptType}</span>
                                )}
                                {p.origin && <span className="text-[8px] text-zinc-600">· {p.origin}</span>}
                                <button
                                    onClick={() => copyToClipboard(p.body)}
                                    className="text-[8px] text-zinc-600 hover:text-zinc-400 transition-colors ml-auto"
                                    title="Copy prompt"
                                >
                                    📋
                                </button>
                            </div>
                            {p.title && <div className="text-[10px] text-zinc-400 font-medium mb-0.5">{p.title}</div>}
                            <div className="text-[10px] text-zinc-500 whitespace-pre-wrap break-words leading-relaxed">{p.body}</div>
                        </div>
                    ))}
                </CollapsibleSection>
            )}

            {/* Notes */}
            {notes.length > 0 && (
                <CollapsibleSection label={`Notes (${notes.length})`} defaultOpen={notesDefaultOpen ?? false}>
                    {notes.map((n, i) => (
                        <div key={i} className="text-[10px] text-zinc-500 mb-1 last:mb-0 whitespace-pre-wrap break-words leading-relaxed">{n.body}</div>
                    ))}
                </CollapsibleSection>
            )}



            {/* Portal lightbox — fullscreen, outside any drawer/overflow container */}
            {lightbox && (
                <EntityImageLightbox
                    src={lightbox.src}
                    filename={lightbox.filename}
                    onClose={() => setLightbox(null)}
                />
            )}
        </div>
    )
}

// ── Collapsible ──

function CollapsibleSection({ label, defaultOpen = false, children }: { label: string; defaultOpen?: boolean; children: React.ReactNode }) {
    const [open, setOpen] = useState(defaultOpen)
    return (
        <div>
            <button
                onClick={() => setOpen(p => !p)}
                className="text-[10px] text-zinc-600 uppercase tracking-wider mb-0.5 flex items-center gap-1 hover:text-zinc-400 transition-colors"
            >
                <span className="text-[8px]">{open ? '▼' : '▶'}</span>
                {label}
            </button>
            {open && <div className="pl-2 border-l border-zinc-800 mt-1">{children}</div>}
        </div>
    )
}