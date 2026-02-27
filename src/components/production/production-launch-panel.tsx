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

// ── Edge ref detection (canonical + backward compat) ──

function isRefEdge(edge: ExportEdge, sourceNode?: ExportNode): boolean {
    const label = edge.label
    if (label === 'ref') return true
    if (label != null && label !== 'ref') return false
    // legacy (label null/undefined): include ONLY if source is media
    if (!sourceNode) return false
    return sourceNode.type === 'image' || sourceNode.type === 'video'
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
        const label = humanMediaName(node.data as Record<string, unknown>, node.type) || asString(node.data.title ?? node.data.label ?? node.data.name ?? '')
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
    title: string
    label: string
    origin: string
    body: string
    createdAt: string
}

function buildPromptEntries(promptNodes: ExportNode[]): PromptEntry[] {
    const entries: PromptEntry[] = promptNodes.map(node => {
        const typeRaw = asString(node.data.promptType ?? node.data.type ?? node.data.kind ?? '')
        const label = promptTypeLabel(typeRaw)
        const title = asString(node.data.title ?? node.data.name ?? node.data.label ?? '') || 'Untitled'
        const origin = formatOrigin(asString(node.data.origin ?? node.data.source ?? node.data.model ?? node.data.provider ?? ''))
        const body = asString(node.data.body ?? node.data.text ?? node.data.content ?? '')
        const createdAt = asString(node.data.createdAt ?? node.data.created_at ?? '')
        return { node, title, label, origin, body, createdAt }
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

// ── Column-aware grouping ──

interface ColumnGroup {
    columnId: string
    title: string
    entries: PromptEntry[]
}

interface GroupedPrompts {
    /** Prompts NOT inside any column — createdAt ASC */
    loose: PromptEntry[]
    /** Column sections in deterministic order (column createdAt ASC, fallback id) */
    columns: ColumnGroup[]
    /** Flat ordered list (loose first, then column groups in order) for indexing */
    flat: PromptEntry[]
}

function groupPromptsByColumn(
    promptEntries: PromptEntry[],
    nodes: ExportNode[],
): GroupedPrompts {
    // Build column map: id → column node
    const columnMap = new Map<string, ExportNode>()
    for (const n of nodes) {
        if (n.type === 'column') columnMap.set(n.id, n)
    }

    const loose: PromptEntry[] = []
    const colBuckets = new Map<string, PromptEntry[]>()

    for (const entry of promptEntries) {
        const pid = entry.node.data.parentId as string | null | undefined
        if (pid && columnMap.has(pid)) {
            let bucket = colBuckets.get(pid)
            if (!bucket) { bucket = []; colBuckets.set(pid, bucket) }
            bucket.push(entry)
        } else {
            loose.push(entry)
        }
    }

    // Sort loose by createdAt ASC (already done by buildPromptEntries, but defensive)
    loose.sort((a, b) => {
        if (!a.createdAt && !b.createdAt) return 0
        if (!a.createdAt) return 1
        if (!b.createdAt) return -1
        return a.createdAt.localeCompare(b.createdAt)
    })

    // Build column groups, ordered by column createdAt ASC (fallback id)
    const colIds = Array.from(colBuckets.keys())
    colIds.sort((a, b) => {
        const ca = asString(columnMap.get(a)?.data.createdAt ?? columnMap.get(a)?.data.created_at ?? '')
        const cb = asString(columnMap.get(b)?.data.createdAt ?? columnMap.get(b)?.data.created_at ?? '')
        if (ca && cb) return ca.localeCompare(cb)
        if (!ca && !cb) return a.localeCompare(b)
        return ca ? -1 : 1
    })

    const columns: ColumnGroup[] = colIds.map(colId => {
        const colNode = columnMap.get(colId)!
        const title = asString(colNode.data.title ?? '') || 'Column'
        const childOrder: string[] = (colNode.data as any).childOrder ?? []
        const bucket = colBuckets.get(colId)!

        // Order by childOrder position (filtered to prompts in bucket)
        const idSet = new Set(bucket.map(e => e.node.id))
        const ordered: PromptEntry[] = []
        const placed = new Set<string>()

        // First: entries that appear in childOrder
        for (const cid of childOrder) {
            if (idSet.has(cid) && !placed.has(cid)) {
                const e = bucket.find(b => b.node.id === cid)
                if (e) { ordered.push(e); placed.add(cid) }
            }
        }
        // Then: any remaining (not in childOrder) by createdAt ASC
        for (const e of bucket) {
            if (!placed.has(e.node.id)) ordered.push(e)
        }

        return { columnId: colId, title, entries: ordered }
    })

    // Flat = loose first, then column groups in order
    const flat: PromptEntry[] = [...loose]
    for (const cg of columns) flat.push(...cg.entries)

    return { loose, columns, flat }
}

// ── Column Notes resolver ──

function resolveColumnNotes(
    columnId: string,
    nodes: ExportNode[],
    childOrder: string[],
): ExportNode[] {
    // Notes with parentId === columnId
    const notes = nodes.filter(n => n.type === 'note' && (n.data as any).parentId === columnId)
    if (notes.length === 0) return []

    // Order by childOrder if available, fallback createdAt
    const idSet = new Set(notes.map(n => n.id))
    const ordered: ExportNode[] = []
    const placed = new Set<string>()

    for (const cid of childOrder) {
        if (idSet.has(cid) && !placed.has(cid)) {
            const n = notes.find(nd => nd.id === cid)
            if (n) { ordered.push(n); placed.add(cid) }
        }
    }
    for (const n of notes) {
        if (!placed.has(n.id)) ordered.push(n)
    }

    return ordered
}

// ── Column Attachments (media inside column, NOT already refs) ──

interface ColumnAttachment {
    node: ExportNode
    src: string
    name: string
}

function resolveColumnAttachments(
    columnId: string,
    nodes: ExportNode[],
    childOrder: string[],
    referencedMediaIds: Set<string>,
): ColumnAttachment[] {
    // Media nodes with parentId === columnId, excluding already-referenced
    const media = nodes.filter(n =>
        (n.type === 'image' || n.type === 'video') &&
        (n.data as any).parentId === columnId &&
        !referencedMediaIds.has(n.id)
    )
    if (media.length === 0) return []

    // Order: childOrder first, then createdAt ASC, then id ASC
    const idSet = new Set(media.map(n => n.id))
    const ordered: ExportNode[] = []
    const placed = new Set<string>()

    for (const cid of childOrder) {
        if (idSet.has(cid) && !placed.has(cid)) {
            const n = media.find(nd => nd.id === cid)
            if (n) { ordered.push(n); placed.add(cid) }
        }
    }
    // Remaining: createdAt ASC then id ASC
    const remaining = media.filter(n => !placed.has(n.id))
    remaining.sort((a, b) => {
        const ca = asString(a.data.createdAt ?? a.data.created_at ?? '')
        const cb = asString(b.data.createdAt ?? b.data.created_at ?? '')
        const cmp = ca.localeCompare(cb)
        if (cmp !== 0) return cmp
        return a.id.localeCompare(b.id)
    })
    for (const n of remaining) ordered.push(n)

    return ordered.map((node, i) => {
        const src = asString(node.data.src ?? node.data.url ?? node.data.publicUrl ?? node.data.storage_path ?? node.data.thumbnail ?? '')
        const name = humanMediaName(node.data as Record<string, unknown>, node.type, i + 1)
        return { node, src, name: name || 'untitled' }
    })
}

function formatAttachmentsForPack(attachments: ColumnAttachment[], exportNameMap: Map<string, string>): string {
    if (attachments.length === 0) return ''
    const lines = attachments.map(a => {
        const exportName = exportNameMap.get(a.node.id) ?? 'file'
        return `- ${exportName}`
    })
    return `\nCOLUMN ATTACHMENTS (UPLOAD)\n${lines.join('\n')}`
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
    // Collect incoming-only media → prompt refs using isRefEdge.
    const neighborIds = new Set<string>()
    for (const edge of edges) {
        if (edge.to !== promptNodeId || edge.from === promptNodeId) continue
        const src = nodeMap.get(edge.from)
        if (!isRefEdge(edge, src)) continue
        neighborIds.add(edge.from)
    }

    const refs: PromptRef[] = []
    for (const nid of neighborIds) {
        const node = nodeMap.get(nid)!

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

    // Sort: rank ASC, then createdAt ASC, then id ASC (fully deterministic)
    refs.sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank
        const ca = asString(a.node.data.createdAt ?? a.node.data.created_at ?? '')
        const cb = asString(b.node.data.createdAt ?? b.node.data.created_at ?? '')
        const cmp = ca.localeCompare(cb)
        if (cmp !== 0) return cmp
        return a.node.id.localeCompare(b.node.id)
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

// Format refs section for Prompt Pack — uses human export names
function formatRefsForPack(refs: PromptRef[], exportNameMap: Map<string, string>): string {
    if (refs.length === 0) return ''
    const lines = refs.map(ref => {
        const exportName = exportNameMap.get(ref.node.id) ?? 'file'
        return `- ${exportName}`
    })
    return `\nINPUT REFERENCES (UPLOAD)\n${lines.join('\n')}`
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
    exportNameMap: Map<string, string>,
): string {
    const parts: string[] = []

    // Header — compact single line
    parts.push(`PROMPT #${index + 1}  |  ${entry.label}  |  ${entry.title}  |  Origin: ${entry.origin}`)
    parts.push(SECTION_LINE)
    parts.push('')

    // Body (breathed)
    parts.push(breatheBody(entry.body))

    // Input References
    const refSection = formatRefsForPack(refs, exportNameMap)
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

/**
 * Format a complete column block for "Copy Column Block".
 * Includes all prompts (in column order), column notes (opt-in), and column attachments.
 */
function formatColumnBlock(
    cg: ColumnGroup,
    flatEntries: PromptEntry[],
    promptRefsMap: Map<string, PromptRef[]>,
    promptNotesMap: Map<string, ExportNode[]>,
    blockNotesToggle: Record<string, boolean>,
    colNotes: ExportNode[],
    includeColumnNotes: boolean,
    attachments: ColumnAttachment[],
    exportNameMap: Map<string, string>,
): string {
    const parts: string[] = []

    parts.push(`COLUMN: ${cg.title}`)
    parts.push(SECTION_LINE)

    for (const entry of cg.entries) {
        const gIdx = flatEntries.indexOf(entry)
        const refs = promptRefsMap.get(entry.node.id) ?? []
        const incomingNotes = promptNotesMap.get(entry.node.id) ?? []
        const notesOn = !!blockNotesToggle[entry.node.id]
        parts.push('')
        parts.push(formatPromptBlock(entry, gIdx, refs, incomingNotes, notesOn, exportNameMap))
    }

    if (includeColumnNotes && colNotes.length > 0) {
        const noteSection = formatNotesForBlock(colNotes)
        if (noteSection) {
            parts.push('')
            parts.push(`COLUMN NOTES\n${SECTION_LINE}${noteSection}`)
        }
    }

    if (attachments.length > 0) {
        parts.push('')
        parts.push(formatAttachmentsForPack(attachments, exportNameMap))
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

// ── Export ZIP helpers ──

interface AssetDescriptor {
    nodeId: string
    type: 'image' | 'video'
    bucket: string
    storagePath: string
    originalFilename: string
    nodeData: Record<string, unknown>
    role: 'ref' | 'attachment' | 'final_visual' | 'output'
}

function nodeToAssetDescriptor(
    node: ExportNode,
    role: 'ref' | 'attachment' | 'final_visual' | 'output',
): AssetDescriptor | null {
    if (node.type !== 'image' && node.type !== 'video') return null

    const storagePath = asString(node.data.storage_path ?? node.data.storagePath ?? '')
    if (!storagePath) return null

    const bucket = node.type === 'image' ? 'take-images' : 'take-videos'
    const filename = asString(node.data.display_name ?? node.data.filename ?? '')

    return {
        nodeId: node.id, type: node.type as 'image' | 'video',
        bucket, storagePath, originalFilename: filename,
        nodeData: node.data as Record<string, unknown>, role,
    }
}

function buildAssetsFromRefs(
    refs: PromptRef[],
    currentFinalVisualId: string | null,
    outputVideoNodeId: string | null,
): AssetDescriptor[] {
    const assets: AssetDescriptor[] = []
    const seen = new Set<string>()
    for (const ref of refs) {
        if (seen.has(ref.node.id)) continue
        seen.add(ref.node.id)
        let role: 'ref' | 'final_visual' | 'output' = 'ref'
        if (ref.node.type === 'image' && currentFinalVisualId && (ref.node.data as any).promotedSelectionId === currentFinalVisualId) role = 'final_visual'
        else if (ref.node.type === 'video' && ref.node.id === outputVideoNodeId) role = 'output'
        const desc = nodeToAssetDescriptor(ref.node, role)
        if (desc) assets.push(desc)
    }
    return assets
}

function buildAssetsFromAttachments(attachments: ColumnAttachment[]): AssetDescriptor[] {
    const assets: AssetDescriptor[] = []
    for (const att of attachments) {
        const desc = nodeToAssetDescriptor(att.node, 'attachment')
        if (desc) assets.push(desc)
    }
    return assets
}

const ROLE_PRIORITY: Record<string, number> = { final_visual: 0, output: 1, ref: 2, attachment: 3 }

/** Dedup by nodeId, keeping the highest-priority role (FV > Output > ref > attachment). */
function dedupeAssets(assets: AssetDescriptor[]): AssetDescriptor[] {
    const map = new Map<string, AssetDescriptor>()
    for (const a of assets) {
        const existing = map.get(a.nodeId)
        if (!existing || (ROLE_PRIORITY[a.role] ?? 9) < (ROLE_PRIORITY[existing.role] ?? 9)) {
            map.set(a.nodeId, a)
        }
    }
    return Array.from(map.values())
}

/** Resolve human-readable display name for a media node. Never returns UUID/storagePath. */
function humanMediaName(data: Record<string, unknown>, nodeType: string, fallbackIndex?: number): string {
    const raw = asString(data.display_name ?? data.filename ?? '')
    if (raw) return raw
    // Old nodes without display_name: generic label
    if (fallbackIndex !== undefined) return `${nodeType === 'video' ? 'Video' : 'Image'} ${fallbackIndex}`
    return ''
}

/** Sanitize a filename for filesystem use (ZIP, downloads). */
function sanitizeExportName(name: string): string {
    // Remove path separators, control chars, keep Unicode letters/numbers/spaces/dots/hyphens
    return name.replace(/[/\\:*?"<>|\x00-\x1f]/g, '_').substring(0, 120)
}

/** Assign deterministic export names using human filenames.
 *  Collision handling: "uomo.png", "uomo (2).png", "uomo (3).png" */
function assignExportNames(assets: AssetDescriptor[]): Map<string, string> {
    const map = new Map<string, string>()
    const usedNames = new Map<string, number>() // lowercase name → count

    for (let i = 0; i < assets.length; i++) {
        const asset = assets[i]
        const raw = humanMediaName(asset.nodeData, asset.type, i + 1)
        const sanitized = sanitizeExportName(raw)

        // Split into stem + ext
        const dotIdx = sanitized.lastIndexOf('.')
        let stem = dotIdx > 0 ? sanitized.substring(0, dotIdx) : sanitized
        let ext = dotIdx > 0 ? sanitized.substring(dotIdx) : (asset.type === 'video' ? '.mp4' : '.png')

        if (!stem) stem = asset.type === 'video' ? 'Video' : 'Image'
        if (!ext) ext = asset.type === 'video' ? '.mp4' : '.png'

        // Collision detection (case-insensitive)
        const key = `${stem}${ext}`.toLowerCase()
        const count = usedNames.get(key) ?? 0
        usedNames.set(key, count + 1)

        let name: string
        if (count === 0) {
            name = `${stem}${ext}`
        } else {
            name = `${stem} (${count + 1})${ext}`
        }

        map.set(asset.nodeId, name)
    }
    return map
}

/** Build the complete prompt.txt content: upload header + body text.
 *  Header lists export names for the SAME assets in this export context. */
function buildPromptFileText(assets: AssetDescriptor[], exportNameMap: Map<string, string>, bodyText: string): string {
    const fileList = assets
        .map(a => exportNameMap.get(a.nodeId))
        .filter((n): n is string => !!n)
    const header = [
        'UPLOAD IMAGES IN THIS ORDER:',
        ...fileList,
        '',
        '─'.repeat(40),
        '',
    ].join('\n')
    return header + bodyText
}

async function triggerExportZip(
    mode: 'prompt' | 'column' | 'pack',
    assets: AssetDescriptor[],
    exportNameMap: Map<string, string>,
    promptFileText?: string,
): Promise<void> {
    if (assets.length === 0) {
        console.warn('[export-pack] no assets to export')
        return
    }

    // Enrich assets with export names for the route
    const enriched = assets.map(a => ({
        ...a,
        exportName: exportNameMap.get(a.nodeId) ?? a.originalFilename ?? 'file',
    }))

    const payload = { mode, assets: enriched, promptFileText }
    console.log('[export-pack] payload', payload.mode, payload.assets.length, 'assets')

    try {
        const resp = await fetch('/api/export-pack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })

        if (!resp.ok) {
            const errText = await resp.text().catch(() => '(no body)')
            console.error(`[export-pack] server ${resp.status}:`, errText)
            alert(`Export failed (${resp.status}). Check console for details.`)
            return
        }

        const blob = await resp.blob()
        console.log('[export-pack] received blob', blob.size, 'bytes', blob.type)

        if (blob.size === 0) {
            console.error('[export-pack] empty blob received')
            return
        }

        // Parse filename from Content-Disposition header
        const cd = resp.headers.get('content-disposition') ?? ''
        const fnMatch = cd.match(/filename="?([^";\s]+)"?/)
        const filename = fnMatch?.[1] ?? `cineboard-${mode}.zip`

        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.style.display = 'none'
        document.body.appendChild(a)
        a.click()
        // Cleanup after a tick to ensure download starts
        setTimeout(() => {
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
        }, 100)
    } catch (err) {
        console.error('[export-pack] fetch error:', err)
        alert('Export failed. Check console for details.')
    }
}

// ── Download Assets Button ──

function DownloadAssetsButton({ assets, mode, label, exportNameMap, promptFileText }: {
    assets: AssetDescriptor[]
    mode: 'prompt' | 'column' | 'pack'
    label: string
    exportNameMap: Map<string, string>
    promptFileText?: string
}) {
    const [busy, setBusy] = useState(false)

    const handleClick = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation()
        if (busy || assets.length === 0) return
        setBusy(true)
        try {
            await triggerExportZip(mode, assets, exportNameMap, promptFileText)
        } finally {
            setBusy(false)
        }
    }, [assets, mode, busy, exportNameMap, promptFileText])

    if (assets.length === 0) return null

    return (
        <button
            onClick={handleClick}
            disabled={busy}
            className="px-2 py-1 text-[10px] rounded transition-colors border border-zinc-700 bg-transparent hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 shrink-0 disabled:opacity-50"
        >
            {busy ? '⏳ Exporting…' : `↓ ${label}`}
        </button>
    )
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
    const grouped = useMemo(() => groupPromptsByColumn(promptEntries, nodes), [promptEntries, nodes])
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

    // Column Notes toggle (opt-in, default OFF)
    const [includeColumnNotes, setIncludeColumnNotes] = useState(false)

    // Resolve column notes per column (memoized)
    const columnNotesMap = useMemo(() => {
        const m = new Map<string, ExportNode[]>()
        for (const cg of grouped.columns) {
            const colNode = nodes.find(n => n.id === cg.columnId)
            const childOrder: string[] = colNode ? ((colNode.data as any).childOrder ?? []) : []
            m.set(cg.columnId, resolveColumnNotes(cg.columnId, nodes, childOrder))
        }
        return m
    }, [grouped.columns, nodes])

    // Resolve column attachments per column (media in column, not already refs)
    const columnAttachmentsMap = useMemo(() => {
        const m = new Map<string, ColumnAttachment[]>()
        for (const cg of grouped.columns) {
            const colNode = nodes.find(n => n.id === cg.columnId)
            const childOrder: string[] = colNode ? ((colNode.data as any).childOrder ?? []) : []
            // Collect all media ids already referenced by prompts in this column
            const refMediaIds = new Set<string>()
            for (const entry of cg.entries) {
                const refs = promptRefsMap.get(entry.node.id) ?? []
                for (const r of refs) refMediaIds.add(r.node.id)
            }
            m.set(cg.columnId, resolveColumnAttachments(cg.columnId, nodes, childOrder, refMediaIds))
        }
        return m
    }, [grouped.columns, nodes, promptRefsMap])

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

    // All pack-level assets (for "Download All Assets" button)
    const allPackAssets = useMemo(() => {
        const all: AssetDescriptor[] = []
        for (const entry of grouped.flat) {
            const refs = promptRefsMap.get(entry.node.id) ?? []
            all.push(...buildAssetsFromRefs(refs, fvId, outId))
        }
        for (const cg of grouped.columns) {
            const atts = columnAttachmentsMap.get(cg.columnId) ?? []
            all.push(...buildAssetsFromAttachments(atts))
        }
        return dedupeAssets(all)
    }, [grouped, promptRefsMap, columnAttachmentsMap, fvId, outId])

    // Deterministic export name map: nodeId → human filename (sanitized, deduped)
    const exportNameMap = useMemo(() => assignExportNames(allPackAssets), [allPackAssets])

    // Build Prompt Pack v3 — canon format
    const promptPack = useMemo(() => {
        const blocks: string[] = []
        let globalIdx = 0

        // Loose prompts first
        for (const entry of grouped.loose) {
            const refs = promptRefsMap.get(entry.node.id) ?? []
            const incomingNotes = promptNotesMap.get(entry.node.id) ?? []
            blocks.push(formatPromptBlock(entry, globalIdx, refs, incomingNotes, includeNotes, exportNameMap))
            globalIdx++
        }

        // Column groups
        for (const cg of grouped.columns) {
            const colHeader = `COLUMN: ${cg.title}\n${SECTION_LINE}`
            const colBlocks: string[] = [colHeader]

            for (const entry of cg.entries) {
                const refs = promptRefsMap.get(entry.node.id) ?? []
                const incomingNotes = promptNotesMap.get(entry.node.id) ?? []
                colBlocks.push(formatPromptBlock(entry, globalIdx, refs, incomingNotes, includeNotes, exportNameMap))
                globalIdx++
            }

            // Column Notes (opt-in)
            if (includeColumnNotes) {
                const colNotes = columnNotesMap.get(cg.columnId) ?? []
                const colNoteSection = formatNotesForBlock(colNotes)
                if (colNoteSection) {
                    colBlocks.push(`COLUMN NOTES\n${SECTION_LINE}${colNoteSection}`)
                }
            }

            // Column Attachments (unlinked media inside column)
            const colAttachments = columnAttachmentsMap.get(cg.columnId) ?? []
            if (colAttachments.length > 0) {
                colBlocks.push(formatAttachmentsForPack(colAttachments, exportNameMap))
            }

            blocks.push(colBlocks.join('\n\n'))
        }

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
    }, [grouped, promptRefsMap, promptNotesMap, includeNotes, includeColumnNotes, columnNotesMap, columnAttachmentsMap, noteNodes, exportNameMap])

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
                        {/* Left Column: Prompts (pure reflection + references, column-aware) */}
                        <div className="flex-1 border-r border-zinc-800 px-6 py-4 overflow-y-auto">
                            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-4">
                                Prompts {hasPrompts && <span className="text-zinc-600">({grouped.flat.length})</span>}
                            </h3>

                            {!hasPrompts && (
                                <p className="text-xs text-zinc-600 italic">No prompts in this Take.</p>
                            )}

                            {/* Loose prompts (no column) */}
                            {grouped.loose.map((entry) => {
                                const gIdx = grouped.flat.indexOf(entry)
                                const refs = promptRefsMap.get(entry.node.id) ?? []
                                const incomingNotes = promptNotesMap.get(entry.node.id) ?? []
                                const notesOn = !!blockNotesToggle[entry.node.id]
                                const copyBlock = formatPromptBlock(entry, gIdx, refs, incomingNotes, notesOn, exportNameMap)

                                return (
                                    <div key={entry.node.id} className="mb-5">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                                                    {entry.label}
                                                </span>
                                                <span className="text-[9px] text-zinc-600">
                                                    #{gIdx + 1}
                                                </span>
                                                <span className="text-[10px] text-zinc-400 truncate max-w-[200px]">
                                                    {entry.title}
                                                </span>
                                            </div>
                                            <span className="text-[8px] text-zinc-600 italic">
                                                {entry.origin}
                                            </span>
                                        </div>

                                        <textarea
                                            readOnly
                                            value={entry.body || '(empty)'}
                                            className="w-full bg-zinc-800/50 border border-zinc-700 rounded text-xs text-zinc-300 p-3 resize-none focus:outline-none"
                                            rows={Math.min(Math.max(entry.body.split('\n').length, 3), 10)}
                                        />

                                        {refs.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 mt-2">
                                                {refs.map(ref => (
                                                    <RefChip key={ref.node.id} ref_={ref} currentFinalVisualId={fvId} outputVideoNodeId={outId} />
                                                ))}
                                            </div>
                                        )}

                                        <div className="flex items-center gap-2 mt-1.5">
                                            <CopyButton text={copyBlock} label="Copy Block" />
                                            {(() => {
                                                const promptAssets = buildAssetsFromRefs(refs, fvId, outId)
                                                return (
                                                    <DownloadAssetsButton
                                                        assets={promptAssets}
                                                        mode="prompt"
                                                        label="Download"
                                                        exportNameMap={exportNameMap}
                                                        promptFileText={buildPromptFileText(promptAssets, exportNameMap, copyBlock)}
                                                    />
                                                )
                                            })()}
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

                            {/* Column sections */}
                            {grouped.columns.map(cg => {
                                const colNotes = columnNotesMap.get(cg.columnId) ?? []
                                const colAttachments = columnAttachmentsMap.get(cg.columnId) ?? []
                                const columnBlockText = formatColumnBlock(
                                    cg, grouped.flat, promptRefsMap, promptNotesMap, blockNotesToggle,
                                    colNotes, includeColumnNotes, colAttachments, exportNameMap,
                                )
                                // Build column assets: all prompt refs + column attachments (deduped by nodeId)
                                const columnAssets: AssetDescriptor[] = (() => {
                                    const all: AssetDescriptor[] = []
                                    for (const entry of cg.entries) {
                                        const refs = promptRefsMap.get(entry.node.id) ?? []
                                        all.push(...buildAssetsFromRefs(refs, fvId, outId))
                                    }
                                    all.push(...buildAssetsFromAttachments(colAttachments))
                                    return dedupeAssets(all)
                                })()
                                return (
                                    <div key={cg.columnId} className="mb-6">
                                        {/* Column header */}
                                        <div className="flex items-center justify-between mb-3 pb-1.5 border-b border-zinc-600/60">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-300">
                                                    ▸ {cg.title}
                                                </span>
                                                <span className="text-[9px] text-zinc-500">
                                                    ({cg.entries.length} prompt{cg.entries.length !== 1 ? 's' : ''})
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <CopyButton text={columnBlockText} label="Copy Column Block" />
                                                <DownloadAssetsButton assets={columnAssets} mode="column" label="Download" exportNameMap={exportNameMap} promptFileText={buildPromptFileText(columnAssets, exportNameMap, columnBlockText)} />
                                            </div>
                                        </div>

                                        {/* Column prompts — ordered by childOrder */}
                                        {cg.entries.map((entry) => {
                                            const gIdx = grouped.flat.indexOf(entry)
                                            const refs = promptRefsMap.get(entry.node.id) ?? []
                                            const incomingNotes = promptNotesMap.get(entry.node.id) ?? []
                                            const notesOn = !!blockNotesToggle[entry.node.id]
                                            const copyBlock = formatPromptBlock(entry, gIdx, refs, incomingNotes, notesOn, exportNameMap)

                                            return (
                                                <div key={entry.node.id} className="mb-5 ml-3 border-l-2 border-blue-500/20 pl-3">
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                                                                {entry.label}
                                                            </span>
                                                            <span className="text-[9px] text-zinc-600">
                                                                #{gIdx + 1}
                                                            </span>
                                                            <span className="text-[10px] text-zinc-400 truncate max-w-[200px]">
                                                                {entry.title}
                                                            </span>
                                                        </div>
                                                        <span className="text-[8px] text-zinc-600 italic">
                                                            {entry.origin}
                                                        </span>
                                                    </div>

                                                    <textarea
                                                        readOnly
                                                        value={entry.body || '(empty)'}
                                                        className="w-full bg-zinc-800/50 border border-zinc-700 rounded text-xs text-zinc-300 p-3 resize-none focus:outline-none"
                                                        rows={Math.min(Math.max(entry.body.split('\n').length, 3), 10)}
                                                    />

                                                    {refs.length > 0 && (
                                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                                            {refs.map(ref => (
                                                                <RefChip key={ref.node.id} ref_={ref} currentFinalVisualId={fvId} outputVideoNodeId={outId} />
                                                            ))}
                                                        </div>
                                                    )}

                                                    <div className="flex items-center gap-2 mt-1.5">
                                                        <CopyButton text={copyBlock} label="Copy Block" />
                                                        {(() => {
                                                            const promptAssets = buildAssetsFromRefs(refs, fvId, outId)
                                                            return (
                                                                <DownloadAssetsButton
                                                                    assets={promptAssets}
                                                                    mode="prompt"
                                                                    label="Download"
                                                                    exportNameMap={exportNameMap}
                                                                    promptFileText={buildPromptFileText(promptAssets, exportNameMap, copyBlock)}
                                                                />
                                                            )
                                                        })()}
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

                                        {/* Column Notes count (visible if any) */}
                                        {colNotes.length > 0 && (
                                            <div className="ml-3 pl-3 border-l-2 border-blue-500/20">
                                                <span className="text-[9px] text-zinc-600 italic">
                                                    {colNotes.length} column note{colNotes.length !== 1 ? 's' : ''} {includeColumnNotes ? '(included in pack)' : '(toggle below to include)'}
                                                </span>
                                            </div>
                                        )}

                                        {/* Column Attachments — unlinked media inside column */}
                                        {colAttachments.length > 0 && (
                                            <div className="ml-3 pl-3 border-l-2 border-blue-500/20 mt-2">
                                                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block mb-1.5">
                                                    Column Attachments ({colAttachments.length})
                                                </span>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {colAttachments.map(att => (
                                                        <div key={att.node.id} className="flex items-center gap-1.5 bg-zinc-800/70 border border-zinc-700 rounded px-1.5 py-1 max-w-[180px]">
                                                            {att.src && (
                                                                <div className="w-6 h-6 shrink-0 rounded overflow-hidden bg-zinc-700">
                                                                    <img src={att.src} alt="" className="w-full h-full object-cover" loading="lazy" />
                                                                </div>
                                                            )}
                                                            <div className="flex items-center gap-1 min-w-0 overflow-hidden">
                                                                <span className="text-[9px] text-zinc-500 shrink-0">{nodeTypeLabel(att.node.type)}</span>
                                                                <span className="text-[9px] text-zinc-400 truncate">{att.name}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}

                            {/* Footer: Copy Prompt Pack + toggles */}
                            {hasPrompts && (
                                <div className="flex items-center gap-3 mt-4 pt-3 border-t border-zinc-700/60">
                                    <CopyButton text={promptPack} label="Copy Prompt Pack" />
                                    <DownloadAssetsButton
                                        assets={allPackAssets}
                                        mode="pack"
                                        label="Download Pack"
                                        exportNameMap={exportNameMap}
                                        promptFileText={buildPromptFileText(allPackAssets, exportNameMap, promptPack)}
                                    />
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
                                    {grouped.columns.some(cg => (columnNotesMap.get(cg.columnId) ?? []).length > 0) && (
                                        <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={includeColumnNotes}
                                                onChange={(e) => setIncludeColumnNotes(e.target.checked)}
                                                className="w-3 h-3 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                                            />
                                            <span className="text-[10px] text-zinc-400">
                                                + Column Notes
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
    const name = humanMediaName(ref_.node.data as Record<string, unknown>, ref_.node.type)
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
                    onClick={() => downloadImage(entry.src, entry.label || 'image.png')}
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 px-1.5 py-0.5 bg-zinc-900/80 text-zinc-300 text-[9px] rounded transition-opacity hover:bg-zinc-700"
                >
                    ↓
                </button>
            )}
        </div>
    )
}