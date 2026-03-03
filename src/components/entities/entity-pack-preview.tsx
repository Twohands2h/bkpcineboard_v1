'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// ── Normalizers: handle both EntityContent shape AND Crystallize v1 shape ──

export interface NormalizedMedia {
    storage_path: string
    src: string
    filename: string
    kind: 'image' | 'video'
    generated_with: string
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
    /** 'compact' = small thumbs (default), 'full' = full-width media for inspector drawer */
    variant?: 'compact' | 'full'
    /** Called when user clicks a media thumbnail (for external lightbox) */
    onImageClick?: (url: string) => void
    /** Override default open state for Prompts section */
    promptsDefaultOpen?: boolean
    /** Override default open state for Notes section */
    notesDefaultOpen?: boolean
}

export function EntityPackPreview({ content, variant = 'compact', onImageClick, promptsDefaultOpen, notesDefaultOpen }: EntityPackPreviewProps) {
    const [resolutions, setResolutions] = useState<Record<number, string>>({})

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
                                            className={`w-full object-contain max-h-48 bg-zinc-900${onImageClick ? ' cursor-pointer hover:opacity-90 transition-opacity' : ''}`}
                                            onClick={onImageClick ? () => onImageClick(getMediaUrl(m)) : undefined}
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
                                            <a
                                                href={getMediaUrl(m)}
                                                download={m.filename || 'download'}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-[8px] text-zinc-600 hover:text-zinc-400 transition-colors ml-1 shrink-0"
                                                title="Download"
                                            >
                                                ⬇
                                            </a>
                                        )}
                                    </div>
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

            {/* Provenance (if present at entity level) */}
            {content.provenance && (content.provenance.generated_with || content.provenance.tool_origin) && (
                <div>
                    <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-0.5">Provenance</div>
                    {content.provenance.generated_with && <div className="text-[10px] text-zinc-500">Generated: {content.provenance.generated_with}</div>}
                    {content.provenance.tool_origin && <div className="text-[10px] text-zinc-500">Origin: {content.provenance.tool_origin}</div>}
                </div>
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