'use server'

// ─────────────────────────────────────────────
// Take Export v1.1 — Granular, LLM-ready
// Stateless: no DB writes, no logs, no ID generation
// No interaction with FV, Approved, Selections, Strip
//
// v1.1: Prompt metadata (Type/Origin/Content), plain text images,
//       readable entity/link/pdf format, no code fences, no ![image]()
// ─────────────────────────────────────────────

type ImageRole = 'firstFrame' | 'lastFrame' | 'reference'

interface ExportNode {
    id: string
    type: string
    data: Record<string, any>
}

interface ExportTakeInput {
    takeId: string
    nodes: ExportNode[]
    imageRoles?: Record<string, ImageRole>
}

interface ExportTakeResult {
    markdown: string
    filename: string
}

// ── Whitelist (server-side enforced) ──

const EXPORTABLE_TYPES = new Set([
    'note',
    'prompt',
    'image',
    'entity_reference',
    'link',
    'pdf',
])

// ── Helpers (robust normalization with fallbacks) ──

function asString(v: any): string {
    if (typeof v === 'string') return v.trim()
    if (v == null) return ''
    return String(v).trim()
}

function normalizePromptType(raw: string): string {
    const s = raw.toLowerCase().trim()
    if (s.includes('negative')) return 'negative-prompt'
    if (s.includes('pre')) return 'pre-prompt'
    if (s.includes('post')) return 'post-prompt'
    if (s.includes('master')) return 'master-prompt'
    if (s === 'prompt') return 'prompt'
    return raw ? s : 'prompt'
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

function escapeTripleBackticks(text: string): string {
    return asString(text).replace(/```/g, '\\`\\`\\`')
}

// ── Markdown generation per node type ──

function nodeToMarkdown(node: ExportNode, imageRole?: ImageRole): string {
    const { type, data } = node

    switch (type) {
        case 'note':
            return `### Note\n${escapeTripleBackticks(asString(data.body ?? data.text ?? ''))}\n`

        case 'prompt': {
            const title = escapeTripleBackticks(
                asString(data.title ?? data.name ?? data.header ?? 'Prompt')
            )
            const typeRaw = asString(data.promptType ?? data.type ?? data.kind ?? data.prompt_kind)
            const originRaw = asString(data.origin ?? data.source ?? data.model ?? data.provider ?? data.llm)
            const originCustom = asString(data.originCustom ?? data.customOrigin ?? data.sourceCustom ?? data.other)

            const promptType = normalizePromptType(typeRaw)
            const origin = normalizeOrigin(originRaw, originCustom)
            const body = escapeTripleBackticks(asString(data.body ?? data.text ?? data.content ?? ''))

            return [
                `### ${title}`,
                ``,
                `Type: ${promptType}`,
                `Origin: ${origin}`,
                ``,
                `Content:`,
                body || '(empty)',
                ``,
            ].join('\n')
        }

        case 'image': {
            const label = escapeTripleBackticks(asString(data.title ?? data.label ?? data.name ?? ''))
            const source = asString(data.url ?? data.src ?? data.publicUrl ?? data.storage_url ?? data.storage_path)

            const lines = ['### Image']
            if (imageRole) lines.push(`Role: ${imageRole}`)
            if (label) lines.push(`Label: ${label}`)
            lines.push(source ? `Source: ${source}` : 'Source: (missing)')
            lines.push('')

            return lines.join('\n')
        }

        case 'entity_reference': {
            const name = escapeTripleBackticks(asString(data.name ?? data.entityName ?? 'unnamed'))
            const etype = escapeTripleBackticks(asString(data.entityType ?? data.type ?? 'unknown'))
            return `### Entity\nName: ${name}\nType: ${etype}\n`
        }

        case 'link': {
            const url = asString(data.url ?? '')
            const label = escapeTripleBackticks(asString(data.label ?? url))
            return `### Link\nLabel: ${label}\nSource: ${url || '(missing)'}\n`
        }

        case 'pdf': {
            const filename = escapeTripleBackticks(asString(data.filename ?? data.name ?? 'document.pdf'))
            const source = asString(data.url ?? data.storage_url ?? data.storage_path ?? '')
            return `### PDF\nFile: ${filename}\nSource: ${source || '(missing)'}\n`
        }

        default:
            return ''
    }
}

// ── Main action ──

export async function exportTakeAction(input: ExportTakeInput): Promise<ExportTakeResult> {
    const { nodes, imageRoles } = input

    // 1. Whitelist enforcement — ignore non-exportable types silently
    const exportableNodes = nodes.filter(node =>
        EXPORTABLE_TYPES.has(node.type)
    )

    // 2. Empty guard
    if (exportableNodes.length === 0) {
        throw new Error('No exportable nodes found after validation')
    }

    // 3. Generate Markdown
    const header = `# Take Export\n\n_Exported from CineBoard — ${new Date().toISOString()}_\n\n---\n\n`

    const body = exportableNodes
        .map(node => nodeToMarkdown(node, imageRoles?.[node.id]))
        .join('\n---\n\n')

    const markdown = header + body

    // 4. Filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filename = `take-export-${timestamp}.md`

    return { markdown, filename }
}