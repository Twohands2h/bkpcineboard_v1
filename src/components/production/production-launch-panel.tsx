'use client'

import { useState, useMemo, useCallback } from 'react'

// ===================================================
// PRODUCTION LAUNCH PANEL (PLP) v2.1
// ===================================================
// Stateless production view of the current Take.
// No DB writes, no server actions, no router.refresh().
// No interaction with FV, Approved, Strip, Canvas key.
// Reads exclusively from canvas snapshot nodes + edges passed as props.
//
// v2:   Pure reflection — all prompt nodes, createdAt ASC, no dedup.
// v2.1: Prompt References — for each prompt, show directly linked nodes
//       via edges (1 hop). Ranked: FV > Output > Asset > others.

interface ExportNode {
    id: string
    type: string
    data: Record<string, any>
}

interface ExportEdge {
    id: string
    from: string
    to: string
    label?: string
}

interface ProductionLaunchPanelProps {
    nodes: ExportNode[]
    edges?: ExportEdge[]
    isApproved: boolean
    currentFinalVisualId?: string | null
    outputVideoNodeId?: string | null
    onClose: () => void
}

// ── Helpers ──

function asString(v: any): string {
    if (typeof v === 'string') return v.trim()
    if (v == null) return ''
    return String(v).trim()
}

// ── Prompt type labels (inline, matches PromptContent.tsx) ──

const PROMPT_TYPE_LABELS: Record<string, string> = {
    'master': 'Master Prompt',
    'prompt': 'Prompt',
    'negative': 'Negative Prompt',
    'pre-prompt': 'Pre-Prompt',
    'post-prompt': 'Post-Prompt',
}

function promptTypeLabel(raw: string): string {
    const key = asString(raw)
    return PROMPT_TYPE_LABELS[key] ?? (key || 'Prompt')
}

function formatOrigin(raw: string): string {
    const s = asString(raw)
    return s || 'manual'
}

// ── Node type display labels ──

const NODE_TYPE_LABELS: Record<string, string> = {
    'image': 'Image',
    'video': 'Video',
    'note': 'Note',
    'prompt': 'Prompt',
    'column': 'Column',
}

function nodeTypeLabel(type: string): string {
    return NODE_TYPE_LABELS[type] ?? type
}

// ── Image role handling ──

type ImageRole = 'firstFrame' | 'lastFrame' | 'reference'

function getImageRole(data: Record<string, any>): ImageRole {
    const role = asString(data.imageRole ?? data.role ?? '')
    if (role === 'firstFrame') return 'firstFrame'
    if (role === 'lastFrame') return 'lastFrame'
    return 'reference'
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

// ── Prompt entry (flat, no categorization) ──

interface PromptEntry {
    node: ExportNode
    label: string
    origin: string
    body: string
    createdAt: string
}

function buildPromptEntries(promptNodes: ExportNode[]): PromptEntry[] {
    const entries: PromptEntry[] = promptNodes.map(node => {
        const typeRaw = asString(node.data.promptType ?? node.data.type ?? node.data.kind ?? '')
        const label = promptTypeLabel(typeRaw)
        const origin = formatOrigin(asString(node.data.origin ?? node.data.source ?? node.data.model ?? node.data.provider ?? ''))
        const body = asString(node.data.body ?? node.data.text ?? node.data.content ?? '')
        const createdAt = asString(node.data.createdAt ?? node.data.created_at ?? '')
        return { node, label, origin, body, createdAt }
    })

    // Sort by createdAt ASC. Nodes without timestamp go last (stable).
    entries.sort((a, b) => {
        if (!a.createdAt && !b.createdAt) return 0
        if (!a.createdAt) return 1
        if (!b.createdAt) return -1
        return a.createdAt.localeCompare(b.createdAt)
    })

    return entries
}

// ── Prompt References (1-hop via edges) ──

interface PromptRef {
    node: ExportNode
    rank: number  // lower = higher priority
    src?: string  // for image/video thumbnail
}

function resolvePromptRefs(
    promptNodeId: string,
    edges: ExportEdge[],
    nodeMap: Map<string, ExportNode>,
    currentFinalVisualId: string | null,
    outputVideoNodeId: string | null,
): PromptRef[] {
    // Collect incoming-only neighbors (media → prompt).
    // Outgoing edges (prompt → media) are outputs/derivati — excluded from refs.
    const neighborIds = new Set<string>()
    for (const edge of edges) {
        if (edge.to === promptNodeId && edge.from !== promptNodeId) neighborIds.add(edge.from)
    }

    const refs: PromptRef[] = []
    for (const nid of neighborIds) {
        const node = nodeMap.get(nid)
        if (!node) continue
        // Media refs only — image and video. Notes/columns/prompts excluded.
        if (node.type !== 'image' && node.type !== 'video') continue

        // Rank: FV=0, Output=1, Asset(promoted)=2, others=3
        let rank = 3
        if (node.type === 'image' && currentFinalVisualId && (node.data as any).promotedSelectionId === currentFinalVisualId) {
            rank = 0
        } else if (node.type === 'video' && node.id === outputVideoNodeId) {
            rank = 1
        } else if (node.type === 'image' && (node.data as any).promotedSelectionId) {
            rank = 2
        }

        const src = (node.type === 'image' || node.type === 'video')
            ? asString(node.data.src ?? node.data.url ?? node.data.publicUrl ?? node.data.storage_path ?? node.data.thumbnail ?? '')
            : undefined

        refs.push({ node, rank, src })
    }

    // Sort: rank ASC, then createdAt ASC as tiebreaker
    refs.sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank
        const ca = asString(a.node.data.createdAt ?? a.node.data.created_at ?? '')
        const cb = asString(b.node.data.createdAt ?? b.node.data.created_at ?? '')
        return ca.localeCompare(cb)
    })

    return refs
}

function refRoleTag(ref: PromptRef, currentFinalVisualId: string | null, outputVideoNodeId: string | null): string | null {
    if (ref.node.type === 'image' && currentFinalVisualId && (ref.node.data as any).promotedSelectionId === currentFinalVisualId) return 'FV'
    if (ref.node.type === 'video' && ref.node.id === outputVideoNodeId) return 'Output'
    if (ref.node.type === 'image' && (ref.node.data as any).promotedSelectionId) return 'Asset'
    return null
}

// ── Prompt Pack v3 — Canon formatting ──

const SECTION_LINE = '────────────────────────────────────────'
const PROMPT_SEPARATOR = '════════════════════════════════════════'

/**
 * Breathe body: if body contains (Label): patterns, expand them.
 * Light touch — only replaces `(Label):` with `\nLabel:\n`.
 * Everything else stays verbatim.
 */
function breatheBody(body: string): string {
    if (!body) return ''
    // Match patterns like "(Shot Type):" or "(Action):" at start of line or after ". "
    return body.replace(/\(([A-Za-z][A-Za-z0-9 ]*)\)\s*:\s*/g, '\n$1:\n')
        .replace(/^\n/, '') // trim leading newline if pattern was at start
        .trim()
}

// Format refs section for Prompt Pack v3
function formatRefsForPack(refs: PromptRef[], currentFinalVisualId: string | null, outputVideoNodeId: string | null): string {
    if (refs.length === 0) return ''
    const lines = refs.map(ref => {
        const tag = refRoleTag(ref, currentFinalVisualId, outputVideoNodeId)
        let name = asString(ref.node.data.filename ?? ref.node.data.originalFileName ?? ref.node.data.name ?? ref.node.data.title ?? ref.node.data.label ?? '')
        // Derive filename from storage_path basename if missing
        if (!name) {
            const sp = asString(ref.node.data.storage_path ?? '')
            if (sp) name = sp.split('/').pop() ?? ''
        }
        if (!name) name = 'untitled'
        // URL priority: publicUrl > src > url > resolved storage_path
        const url = asString(ref.node.data.publicUrl ?? ref.node.data.src ?? ref.node.data.url ?? ref.node.data.storage_path ?? '')
        const typeStr = nodeTypeLabel(ref.node.type)
        const tagStr = tag ? ` [${tag}]` : ''
        let line = `• ${typeStr}${tagStr}`
        line += `\n  File: ${name}`
        if (url) line += `\n  URL:  ${url}`
        return line
    })
    return `\nINPUT REFERENCES\n${SECTION_LINE}\n${lines.join('\n\n')}`
}

// Format notes section for Prompt Pack v3
function formatNotesForBlock(notes: ExportNode[]): string {
    if (notes.length === 0) return ''
    const bodies = notes
        .map(n => asString(n.data.body ?? n.data.text ?? n.data.content ?? ''))
        .filter(Boolean)
    if (bodies.length === 0) return ''
    return `\nNOTES (incoming)\n${SECTION_LINE}\n${bodies.map(b => `• ${b}`).join('\n\n')}`
}

/**
 * Format a single prompt block for Copy Block / Prompt Pack.
 */
function formatPromptBlock(
    entry: PromptEntry,
    index: number,
    refs: PromptRef[],
    incomingNotes: ExportNode[],
    notesOn: boolean,
    fvId: string | null,
    outId: string | null,
): string {
    const parts: string[] = []

    // Header — compact single line
    parts.push(`PROMPT #${index + 1}  |  ${entry.label}  |  Origin: ${entry.origin}`)
    parts.push(SECTION_LINE)
    parts.push('')

    // Body (breathed)
    parts.push(breatheBody(entry.body))

    // Input References
    const refSection = formatRefsForPack(refs, fvId, outId)
    if (refSection) {
        parts.push('')
        parts.push(refSection)
    }

    // Notes (opt-in)
    if (notesOn) {
        const noteSection = formatNotesForBlock(incomingNotes)
        if (noteSection) {
            parts.push('')
            parts.push(noteSection)
        }
    }

    return parts.join('\n')
}

// ── Prompt Notes (incoming note → prompt, opt-in) ──

function resolvePromptNotes(
    promptNodeId: string,
    edges: ExportEdge[],
    nodeMap: Map<string, ExportNode>,
): ExportNode[] {
    const noteIds = new Set<string>()
    for (const edge of edges) {
        if (edge.to === promptNodeId && edge.from !== promptNodeId) {
            const node = nodeMap.get(edge.from)
            if (node && node.type === 'note') noteIds.add(edge.from)
        }
    }
    const notes = Array.from(noteIds).map(id => nodeMap.get(id)!).filter(Boolean)
    notes.sort((a, b) => {
        const ca = asString(a.data.createdAt ?? a.data.created_at ?? '')
        const cb = asString(b.data.createdAt ?? b.data.created_at ?? '')
        return ca.localeCompare(cb)
    })
    return notes
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

// ── Download helper ──

async function downloadImage(src: string, filename: string) {
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
        // fall through
    }

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

export function ProductionLaunchPanel({ nodes, edges, isApproved, currentFinalVisualId, outputVideoNodeId, onClose }: ProductionLaunchPanelProps) {
    const promptNodes = useMemo(() => nodes.filter(n => n.type === 'prompt'), [nodes])
    const imageNodes = useMemo(() => nodes.filter(n => n.type === 'image'), [nodes])
    const noteNodes = useMemo(() => nodes.filter(n => n.type === 'note'), [nodes])

    const nodeMap = useMemo(() => {
        const m = new Map<string, ExportNode>()
        for (const n of nodes) m.set(n.id, n)
        return m
    }, [nodes])

    const promptEntries = useMemo(() => buildPromptEntries(promptNodes), [promptNodes])
    const images = useMemo(() => groupImages(imageNodes), [imageNodes])

    // Resolve references per prompt (memoized as a Map)
    const promptRefsMap = useMemo(() => {
        const edgeList = edges ?? []
        const m = new Map<string, PromptRef[]>()
        for (const entry of promptEntries) {
            m.set(entry.node.id, resolvePromptRefs(
                entry.node.id, edgeList, nodeMap,
                currentFinalVisualId ?? null, outputVideoNodeId ?? null,
            ))
        }
        return m
    }, [promptEntries, edges, nodeMap, currentFinalVisualId, outputVideoNodeId])

    const [includeNotes, setIncludeNotes] = useState(true)

    // Per-prompt notes toggle (opt-in, default OFF)
    const [blockNotesToggle, setBlockNotesToggle] = useState<Record<string, boolean>>({})

    // Resolve incoming notes per prompt (memoized)
    const promptNotesMap = useMemo(() => {
        const edgeList = edges ?? []
        const m = new Map<string, ExportNode[]>()
        for (const entry of promptEntries) {
            m.set(entry.node.id, resolvePromptNotes(entry.node.id, edgeList, nodeMap))
        }
        return m
    }, [promptEntries, edges, nodeMap])

    const hasPrompts = promptEntries.length > 0
    const hasNotes = noteNodes.length > 0
    const hasImages = images.firstFrame || images.lastFrame || images.references.length > 0

    const fvId = currentFinalVisualId ?? null
    const outId = outputVideoNodeId ?? null

    // Build Prompt Pack v3 — canon format
    const promptPack = useMemo(() => {
        const blocks: string[] = []

        promptEntries.forEach((entry, idx) => {
            const refs = promptRefsMap.get(entry.node.id) ?? []
            const incomingNotes = promptNotesMap.get(entry.node.id) ?? []
            // Prompt Pack uses global includeNotes toggle for notes
            blocks.push(formatPromptBlock(entry, idx, refs, incomingNotes, includeNotes, fvId, outId))
        })

        if (includeNotes && noteNodes.length > 0) {
            // Also append unlinked notes (not connected to any prompt) at the end
            const notesBodies = noteNodes
                .map(n => asString(n.data.body ?? n.data.text ?? ''))
                .filter(Boolean)
            if (notesBodies.length > 0) {
                blocks.push(`PRODUCTION NOTES\n${SECTION_LINE}\n${notesBodies.map(b => `• ${b}`).join('\n\n')}`)
            }
        }

        return blocks.join(`\n\n${PROMPT_SEPARATOR}\n\n`)
    }, [promptEntries, promptRefsMap, promptNotesMap, includeNotes, noteNodes, fvId, outId])

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
                        {/* Left Column: Prompts (pure reflection + references) */}
                        <div className="flex-1 border-r border-zinc-800 px-6 py-4 overflow-y-auto">
                            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-4">
                                Prompts {hasPrompts && <span className="text-zinc-600">({promptEntries.length})</span>}
                            </h3>

                            {!hasPrompts && (
                                <p className="text-xs text-zinc-600 italic">No prompts in this Take.</p>
                            )}

                            {promptEntries.map((entry, idx) => {
                                const refs = promptRefsMap.get(entry.node.id) ?? []
                                const incomingNotes = promptNotesMap.get(entry.node.id) ?? []
                                const notesOn = !!blockNotesToggle[entry.node.id]
                                const copyBlock = formatPromptBlock(entry, idx, refs, incomingNotes, notesOn, fvId, outId)

                                return (
                                    <div key={entry.node.id} className="mb-5">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                                                    {entry.label}
                                                </span>
                                                <span className="text-[9px] text-zinc-600">
                                                    #{idx + 1}
                                                </span>
                                            </div>
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

                                        {/* Prompt References — 1-hop linked media nodes */}
                                        {refs.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 mt-2">
                                                {refs.map(ref => (
                                                    <RefChip
                                                        key={ref.node.id}
                                                        ref_={ref}
                                                        currentFinalVisualId={fvId}
                                                        outputVideoNodeId={outId}
                                                    />
                                                ))}
                                            </div>
                                        )}

                                        <div className="flex items-center gap-2 mt-1.5">
                                            <CopyButton text={entry.body} label="Copy Content" />
                                            <CopyButton text={copyBlock} label="Copy Block" />
                                            {incomingNotes.length > 0 && (
                                                <label className="flex items-center gap-1 cursor-pointer select-none ml-1">
                                                    <input
                                                        type="checkbox"
                                                        checked={notesOn}
                                                        onChange={(e) => setBlockNotesToggle(prev => ({ ...prev, [entry.node.id]: e.target.checked }))}
                                                        className="w-3 h-3 rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                                                    />
                                                    <span className="text-[10px] text-zinc-500">
                                                        + Notes ({incomingNotes.length})
                                                    </span>
                                                </label>
                                            )}
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

                        {/* Right Column: Media Kit (INVARIATO) */}
                        <div className="w-[360px] shrink-0 px-6 py-4 overflow-y-auto">
                            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-4">Media Kit</h3>

                            {!hasImages && (
                                <p className="text-xs text-zinc-600 italic">No images in this Take.</p>
                            )}

                            {images.firstFrame && (
                                <div className="mb-4">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-400 block mb-2">
                                        First Frame
                                    </span>
                                    <ImageThumbnail entry={images.firstFrame} />
                                </div>
                            )}

                            {images.lastFrame && (
                                <div className="mb-4">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-400 block mb-2">
                                        Last Frame
                                    </span>
                                    <ImageThumbnail entry={images.lastFrame} />
                                </div>
                            )}

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

// ── RefChip — small chip for a linked reference node ──

function RefChip({ ref_, currentFinalVisualId, outputVideoNodeId }: {
    ref_: PromptRef
    currentFinalVisualId: string | null
    outputVideoNodeId: string | null
}) {
    const tag = refRoleTag(ref_, currentFinalVisualId, outputVideoNodeId)
    let name = asString(ref_.node.data.filename ?? ref_.node.data.originalFileName ?? ref_.node.data.name ?? ref_.node.data.title ?? ref_.node.data.label ?? '')
    if (!name) {
        const sp = asString(ref_.node.data.storage_path ?? '')
        if (sp) name = sp.split('/').pop() ?? ''
    }
    const typeStr = nodeTypeLabel(ref_.node.type)
    const hasThumbnail = ref_.src && (ref_.node.type === 'image' || ref_.node.type === 'video')

    // Tag color
    const tagColor = tag === 'FV'
        ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
        : tag === 'Output'
            ? 'text-emerald-400 bg-emerald-500/10 border-emerald-600/20'
            : tag === 'Asset'
                ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                : ''

    return (
        <div className="flex items-center gap-1.5 bg-zinc-800/70 border border-zinc-700 rounded px-1.5 py-1 max-w-[180px]">
            {/* Thumbnail (image/video only) */}
            {hasThumbnail && (
                <div className="w-6 h-6 shrink-0 rounded overflow-hidden bg-zinc-700">
                    <img
                        src={ref_.src}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                    />
                </div>
            )}

            {/* Type + name */}
            <div className="flex items-center gap-1 min-w-0 overflow-hidden">
                <span className="text-[9px] text-zinc-500 shrink-0">{typeStr}</span>
                {name && (
                    <span className="text-[9px] text-zinc-400 truncate">{name}</span>
                )}
            </div>

            {/* Role tag */}
            {tag && (
                <span className={`text-[8px] font-medium px-1 py-0.5 rounded border shrink-0 ${tagColor}`}>
                    {tag}
                </span>
            )}
        </div>
    )
}

// ── Image thumbnail sub-component (INVARIATO) ──

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