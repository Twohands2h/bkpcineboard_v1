'use client'

import { useState, useMemo, useCallback } from 'react'

// ===================================================
// PRODUCTION LAUNCH PANEL (PLP) v1
// ===================================================
// Stateless production view of the current Take.
// No DB writes, no server actions, no router.refresh().
// No interaction with FV, Approved, Strip, Canvas key.
// Reads exclusively from canvas snapshot nodes passed as props.

interface ExportNode {
    id: string
    type: string
    data: Record<string, any>
}

interface ProductionLaunchPanelProps {
    nodes: ExportNode[]
    isApproved: boolean
    onClose: () => void
}

// ── Helpers ──

function asString(v: any): string {
    if (typeof v === 'string') return v.trim()
    if (v == null) return ''
    return String(v).trim()
}

function normalizeOrigin(raw: string, custom?: string): string {
    const base = asString(raw)
    const c = asString(custom)
    if (!base && c) return `custom — ${c}`
    if (base.toLowerCase() === 'altro' || base.toLowerCase() === 'other') {
        return c ? `custom — ${c}` : 'custom'
    }
    return base || (c ? `custom — ${c}` : 'manual')
}

// ── Prompt types in canonical order ──

const PROMPT_ORDER = ['pre', 'master', 'negative', 'post'] as const
type PromptCategory = typeof PROMPT_ORDER[number]

const PROMPT_LABELS: Record<PromptCategory, string> = {
    pre: 'PRE PROMPT',
    master: 'MASTER PROMPT',
    negative: 'NEGATIVE PROMPT',
    post: 'POST PROMPT',
}

function categorizePromptType(raw: string): PromptCategory {
    const s = asString(raw).toLowerCase()
    if (s.includes('pre')) return 'pre'
    if (s.includes('master')) return 'master'
    if (s.includes('negative')) return 'negative'
    if (s.includes('post')) return 'post'
    // Default: treat as master if unrecognized
    return 'master'
}

// ── Image role handling ──

type ImageRole = 'firstFrame' | 'lastFrame' | 'reference'

function getImageRole(data: Record<string, any>): ImageRole {
    const role = asString(data.imageRole ?? data.role ?? '')
    if (role === 'firstFrame') return 'firstFrame'
    if (role === 'lastFrame') return 'lastFrame'
    return 'reference'
}

// ── Prompt selection: pick primary per category ──

interface PromptEntry {
    node: ExportNode
    category: PromptCategory
    origin: string
    body: string
}

function selectPrimaryPrompts(promptNodes: ExportNode[]): Map<PromptCategory, PromptEntry> {
    // Group by category
    const groups = new Map<PromptCategory, PromptEntry[]>()

    for (const node of promptNodes) {
        const typeRaw = asString(node.data.promptType ?? node.data.type ?? node.data.kind ?? '')
        const category = categorizePromptType(typeRaw)
        const originRaw = asString(node.data.origin ?? node.data.source ?? node.data.model ?? node.data.provider ?? '')
        const originCustom = asString(node.data.originCustom ?? node.data.customOrigin ?? '')
        const origin = normalizeOrigin(originRaw, originCustom)
        const body = asString(node.data.body ?? node.data.text ?? node.data.content ?? '')

        const entry: PromptEntry = { node, category, origin, body }

        if (!groups.has(category)) {
            groups.set(category, [])
        }
        groups.get(category)!.push(entry)
    }

    // Pick primary: most recent (by updated_at if available) or last in array
    const result = new Map<PromptCategory, PromptEntry>()

    for (const [category, entries] of groups) {
        if (entries.length === 0) continue

        if (entries.length === 1) {
            result.set(category, entries[0])
            continue
        }

        // Try to sort by updated_at or created_at
        const withTime = entries.filter(e => e.node.data.updated_at || e.node.data.created_at)
        if (withTime.length > 0) {
            withTime.sort((a, b) => {
                const ta = a.node.data.updated_at ?? a.node.data.created_at ?? ''
                const tb = b.node.data.updated_at ?? b.node.data.created_at ?? ''
                return tb.localeCompare(ta) // descending = most recent first
            })
            result.set(category, withTime[0])
        } else {
            // No timestamp: pick last in array
            result.set(category, entries[entries.length - 1])
        }
    }

    return result
}

// ── Image grouping ──

interface ImageEntry {
    node: ExportNode
    role: ImageRole
    src: string
    label: string
}

function groupImages(imageNodes: ExportNode[]): {
    firstFrame: ImageEntry | null
    lastFrame: ImageEntry | null
    references: ImageEntry[]
} {
    const result = {
        firstFrame: null as ImageEntry | null,
        lastFrame: null as ImageEntry | null,
        references: [] as ImageEntry[],
    }

    for (const node of imageNodes) {
        const role = getImageRole(node.data)
        const src = asString(node.data.src ?? node.data.url ?? node.data.publicUrl ?? node.data.storage_path ?? '')
        const label = asString(node.data.title ?? node.data.label ?? node.data.name ?? '')
        const entry: ImageEntry = { node, role, src, label }

        if (role === 'firstFrame' && !result.firstFrame) {
            result.firstFrame = entry
        } else if (role === 'lastFrame' && !result.lastFrame) {
            result.lastFrame = entry
        } else {
            result.references.push(entry)
        }
    }

    return result
}

// ── Copy helpers ──

async function copyToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text)
        return true
    } catch {
        return false
    }
}

// ── Copy feedback button ──

function CopyButton({ text, label }: { text: string; label: string }) {
    const [copied, setCopied] = useState(false)

    const handleCopy = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation()
        const ok = await copyToClipboard(text)
        if (ok) {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        }
    }, [text])

    return (
        <button
            onClick={handleCopy}
            className="px-2 py-1 text-[10px] rounded transition-colors bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 shrink-0"
        >
            {copied ? '✓ Copied' : label}
        </button>
    )
}

// ── Download helper (with cross-origin blob fallback) ──

async function downloadImage(src: string, filename: string) {
    // Try blob download first (works cross-origin, forces save dialog)
    try {
        const response = await fetch(src)
        if (response.ok) {
            const blob = await response.blob()
            const blobUrl = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = blobUrl
            a.download = filename
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(blobUrl)
            return
        }
    } catch {
        // Fetch failed (CORS etc.) — fall through to anchor method
    }

    // Fallback: anchor download (may open in new tab for cross-origin)
    const a = document.createElement('a')
    a.href = src
    a.download = filename
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
}

// ── Component ──

export function ProductionLaunchPanel({ nodes, isApproved, onClose }: ProductionLaunchPanelProps) {
    const promptNodes = useMemo(() => nodes.filter(n => n.type === 'prompt'), [nodes])
    const imageNodes = useMemo(() => nodes.filter(n => n.type === 'image'), [nodes])
    const noteNodes = useMemo(() => nodes.filter(n => n.type === 'note'), [nodes])

    const primaryPrompts = useMemo(() => selectPrimaryPrompts(promptNodes), [promptNodes])
    const images = useMemo(() => groupImages(imageNodes), [imageNodes])

    const [includeNotes, setIncludeNotes] = useState(false)

    const hasPrompts = primaryPrompts.size > 0
    const hasNotes = noteNodes.length > 0
    const hasImages = images.firstFrame || images.lastFrame || images.references.length > 0

    // Build Prompt Pack: prompts in canonical order, optionally with notes between master and negative
    const promptPack = useMemo(() => {
        const blocks: string[] = []

        // Pre
        const pre = primaryPrompts.get('pre')
        if (pre) blocks.push(`[${PROMPT_LABELS.pre}]\nOrigin: ${pre.origin}\n\n${pre.body}`)

        // Master
        const master = primaryPrompts.get('master')
        if (master) blocks.push(`[${PROMPT_LABELS.master}]\nOrigin: ${master.origin}\n\n${master.body}`)

        // Notes (opt-in, between master and negative)
        if (includeNotes && noteNodes.length > 0) {
            const notesBodies = noteNodes
                .map(n => asString(n.data.body ?? n.data.text ?? ''))
                .filter(Boolean)
            if (notesBodies.length > 0) {
                blocks.push(`[MOTION / PRODUCTION NOTES]\n\n${notesBodies.join('\n\n')}`)
            }
        }

        // Negative
        const negative = primaryPrompts.get('negative')
        if (negative) blocks.push(`[${PROMPT_LABELS.negative}]\nOrigin: ${negative.origin}\n\n${negative.body}`)

        // Post
        const post = primaryPrompts.get('post')
        if (post) blocks.push(`[${PROMPT_LABELS.post}]\nOrigin: ${post.origin}\n\n${post.body}`)

        return blocks.join('\n\n---\n\n')
    }, [primaryPrompts, includeNotes, noteNodes])

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
            <div
                className="bg-zinc-900 border border-zinc-700 rounded-lg w-[1000px] max-w-[95vw] max-h-[80vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
                    <div className="flex items-center gap-3">
                        <h2 className="text-sm font-semibold text-zinc-100">Production Launch</h2>
                        {isApproved ? (
                            <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded">
                                Production Ready
                            </span>
                        ) : (
                            <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase text-zinc-500 bg-zinc-800 border border-zinc-700 rounded">
                                Not Approved
                            </span>
                        )}
                    </div>
                    <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors">✕</button>
                </div>

                {/* Body — two columns */}
                <div className="flex-1 overflow-y-auto">
                    <div className="flex min-h-0">
                        {/* Left Column: Prompts */}
                        <div className="flex-1 border-r border-zinc-800 px-6 py-4 overflow-y-auto">
                            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-4">Prompts</h3>

                            {!hasPrompts && (
                                <p className="text-xs text-zinc-600 italic">No prompts in this Take.</p>
                            )}

                            {PROMPT_ORDER.map(category => {
                                const entry = primaryPrompts.get(category)
                                if (!entry) return null

                                const copyBlock = `[${PROMPT_LABELS[category]}]\nOrigin: ${entry.origin}\n\n${entry.body}`

                                return (
                                    <div key={category} className="mb-5">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                                                {PROMPT_LABELS[category]}
                                            </span>
                                            <span className="text-[9px] text-zinc-500">
                                                Origin: {entry.origin}
                                            </span>
                                        </div>

                                        <textarea
                                            readOnly
                                            value={entry.body || '(empty)'}
                                            className="w-full bg-zinc-800/50 border border-zinc-700 rounded text-xs text-zinc-300 p-3 resize-none focus:outline-none"
                                            rows={Math.min(Math.max(entry.body.split('\n').length, 3), 10)}
                                        />

                                        <div className="flex gap-2 mt-1.5">
                                            <CopyButton text={entry.body} label="Copy Content" />
                                            <CopyButton text={copyBlock} label="Copy Block" />
                                        </div>
                                    </div>
                                )
                            })}

                            {/* Footer: Copy Prompt Pack + Include Notes toggle */}
                            {hasPrompts && (
                                <div className="flex items-center gap-3 mt-4 pt-3 border-t border-zinc-800">
                                    <CopyButton text={promptPack} label="Copy Prompt Pack" />
                                    {hasNotes && (
                                        <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={includeNotes}
                                                onChange={(e) => setIncludeNotes(e.target.checked)}
                                                className="w-3 h-3 rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                                            />
                                            <span className="text-[10px] text-zinc-400">
                                                + Notes ({noteNodes.length})
                                            </span>
                                        </label>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Right Column: Media Kit */}
                        <div className="w-[360px] shrink-0 px-6 py-4 overflow-y-auto">
                            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-4">Media Kit</h3>

                            {!hasImages && (
                                <p className="text-xs text-zinc-600 italic">No images in this Take.</p>
                            )}

                            {/* First Frame */}
                            {images.firstFrame && (
                                <div className="mb-4">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-400 block mb-2">
                                        First Frame
                                    </span>
                                    <ImageThumbnail entry={images.firstFrame} />
                                </div>
                            )}

                            {/* Last Frame */}
                            {images.lastFrame && (
                                <div className="mb-4">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-400 block mb-2">
                                        Last Frame
                                    </span>
                                    <ImageThumbnail entry={images.lastFrame} />
                                </div>
                            )}

                            {/* References */}
                            {images.references.length > 0 && (
                                <div>
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block mb-2">
                                        References ({images.references.length})
                                    </span>
                                    <div className="grid grid-cols-2 gap-2">
                                        {images.references.map(entry => (
                                            <ImageThumbnail key={entry.node.id} entry={entry} compact />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── Image thumbnail sub-component ──

function ImageThumbnail({ entry, compact }: { entry: ImageEntry; compact?: boolean }) {
    const height = compact ? 'h-20' : 'h-32'

    return (
        <div className="group relative">
            {entry.src ? (
                <div className={`${height} w-full bg-zinc-800 border border-zinc-700 rounded overflow-hidden`}>
                    <img
                        src={entry.src}
                        alt={entry.label || 'image'}
                        className="w-full h-full object-contain"
                        loading="lazy"
                    />
                </div>
            ) : (
                <div className={`${height} w-full bg-zinc-800 border border-zinc-700 rounded flex items-center justify-center`}>
                    <span className="text-zinc-600 text-[9px]">no source</span>
                </div>
            )}

            {entry.label && (
                <p className="text-[9px] text-zinc-500 mt-1 truncate">{entry.label}</p>
            )}

            {entry.src && (
                <button
                    onClick={() => downloadImage(entry.src, entry.label || `image-${entry.node.id.slice(0, 8)}`)}
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 px-1.5 py-0.5 bg-zinc-900/80 text-zinc-300 text-[9px] rounded transition-opacity hover:bg-zinc-700"
                >
                    ↓
                </button>
            )}
        </div>
    )
}