'use client'

import { useState, useCallback } from 'react'
import { exportTakeAction } from '@/app/actions/take-export'

// ===================================================
// EXPORT TAKE MODAL — Granular, LLM-ready (v1.1)
// ===================================================
// v1.1: Prompt preview shows Type + Origin badges.
// No DB writes. No state mutation. No interaction with FV/Approved/Strip.

type ImageRole = 'firstFrame' | 'lastFrame' | 'reference'

interface ExportNode {
    id: string
    type: string
    data: Record<string, any>
}

interface ExportTakeModalProps {
    takeId: string
    nodes: ExportNode[]
    onClose: () => void
}

// ── Whitelist (client-side mirror for UI filtering) ──

const EXPORTABLE_TYPES = new Set([
    'note',
    'prompt',
    'image',
    'entity_reference',
    'link',
    'pdf',
])

const TYPE_LABELS: Record<string, string> = {
    note: 'Note',
    prompt: 'Prompt',
    image: 'Image',
    entity_reference: 'Entity Ref',
    link: 'Link',
    pdf: 'PDF',
}

const TYPE_COLORS: Record<string, string> = {
    note: 'bg-zinc-600',
    prompt: 'bg-amber-700',
    image: 'bg-blue-700',
    entity_reference: 'bg-purple-700',
    link: 'bg-cyan-700',
    pdf: 'bg-red-700',
}

// ── Helpers (mirror server-side normalization) ──

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

// ── Preview text extraction ──

function getPreview(node: ExportNode): string {
    const { type, data } = node
    switch (type) {
        case 'note':
            return asString(data.body ?? data.text ?? '').slice(0, 60)
        case 'prompt':
            return asString(data.body ?? data.text ?? data.content ?? '').slice(0, 60)
        case 'image':
            return data.src ? (data.src as string).split('/').pop()?.slice(0, 40) ?? 'image' : 'no source'
        case 'entity_reference':
            return asString(data.name ?? data.entityName ?? 'unnamed entity')
        case 'link':
            return asString(data.label ?? data.url ?? 'link')
        case 'pdf':
            return asString(data.filename ?? data.name ?? 'document.pdf')
        default:
            return ''
    }
}

// ── Prompt metadata extraction (for preview badges) ──

function getPromptMeta(data: Record<string, any>): { promptType: string; origin: string } | null {
    const typeRaw = asString(data.promptType ?? data.type ?? data.kind ?? data.prompt_kind)
    const originRaw = asString(data.origin ?? data.source ?? data.model ?? data.provider ?? data.llm)
    const originCustom = asString(data.originCustom ?? data.customOrigin ?? data.sourceCustom ?? data.other)

    return {
        promptType: normalizePromptType(typeRaw),
        origin: normalizeOrigin(originRaw, originCustom),
    }
}

// ── Browser download ──

function downloadMarkdown(markdown: string, filename: string) {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}

// ── Component ──

export function ExportTakeModal({ takeId, nodes, onClose }: ExportTakeModalProps) {
    const eligibleNodes = nodes.filter(n => EXPORTABLE_TYPES.has(n.type))

    const [selectedIds, setSelectedIds] = useState<Set<string>>(
        () => new Set(eligibleNodes.map(n => n.id))
    )
    const [imageRoles, setImageRoles] = useState<Record<string, ImageRole>>({})
    const [isExporting, setIsExporting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const toggleNode = useCallback((nodeId: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(nodeId)) {
                next.delete(nodeId)
            } else {
                next.add(nodeId)
            }
            return next
        })
    }, [])

    const selectAll = useCallback(() => {
        setSelectedIds(new Set(eligibleNodes.map(n => n.id)))
    }, [eligibleNodes])

    const deselectAll = useCallback(() => {
        setSelectedIds(new Set())
    }, [])

    const setRole = useCallback((nodeId: string, role: ImageRole | '') => {
        setImageRoles(prev => {
            if (role === '') {
                const next = { ...prev }
                delete next[nodeId]
                return next
            }
            return { ...prev, [nodeId]: role }
        })
    }, [])

    const handleExport = useCallback(async () => {
        setError(null)
        setIsExporting(true)
        try {
            const selectedNodes = eligibleNodes.filter(n => selectedIds.has(n.id))
            const result = await exportTakeAction({
                takeId,
                nodes: selectedNodes,
                imageRoles: Object.keys(imageRoles).length > 0 ? imageRoles : undefined,
            })
            downloadMarkdown(result.markdown, result.filename)
            onClose()
        } catch (err: any) {
            setError(err.message ?? 'Export failed')
        } finally {
            setIsExporting(false)
        }
    }, [takeId, eligibleNodes, selectedIds, imageRoles, onClose])

    // Empty state
    if (eligibleNodes.length === 0) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
                <div className="bg-zinc-900 border border-zinc-700 rounded-lg w-[420px] p-6" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-semibold text-zinc-100">Export Take</h2>
                        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xs">✕</button>
                    </div>
                    <p className="text-zinc-500 text-sm">Nessun nodo esportabile in questo Take.</p>
                    <p className="text-zinc-600 text-xs mt-2">Eleggibili: Prompt, Note, Image, Entity Reference, Link, PDF.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
            <div
                className="bg-zinc-900 border border-zinc-700 rounded-lg w-[520px] max-h-[80vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 shrink-0">
                    <h2 className="text-sm font-semibold text-zinc-100">Export Take</h2>
                    <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xs">✕</button>
                </div>

                {/* Node list */}
                <div className="flex-1 overflow-y-auto px-5 py-3">
                    {eligibleNodes.map(node => {
                        const isSelected = selectedIds.has(node.id)
                        const isImage = node.type === 'image'
                        const isPrompt = node.type === 'prompt'
                        const preview = getPreview(node)
                        const promptMeta = isPrompt ? getPromptMeta(node.data) : null

                        return (
                            <div
                                key={node.id}
                                className={`flex items-start gap-3 py-2 px-2 rounded transition-colors cursor-pointer ${isSelected ? 'bg-zinc-800/50' : 'hover:bg-zinc-800/30'
                                    }`}
                                onClick={() => toggleNode(node.id)}
                            >
                                {/* Checkbox */}
                                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${isSelected ? 'bg-zinc-500 border-zinc-400' : 'border-zinc-600'
                                    }`}>
                                    {isSelected && <span className="text-[10px] text-zinc-100">✓</span>}
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        {/* Type badge */}
                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium text-zinc-200 shrink-0 ${TYPE_COLORS[node.type] ?? 'bg-zinc-600'
                                            }`}>
                                            {TYPE_LABELS[node.type] ?? node.type}
                                        </span>

                                        {/* Prompt: Type + Origin badges */}
                                        {promptMeta && (
                                            <>
                                                <span className="px-1 py-0.5 rounded text-[8px] font-medium text-amber-300 bg-amber-900/40 shrink-0">
                                                    {promptMeta.promptType}
                                                </span>
                                                <span className="px-1 py-0.5 rounded text-[8px] font-medium text-zinc-400 bg-zinc-700/60 shrink-0 truncate max-w-[120px]">
                                                    {promptMeta.origin}
                                                </span>
                                            </>
                                        )}
                                    </div>

                                    {/* Preview text */}
                                    <p className="text-xs text-zinc-400 truncate mt-0.5">
                                        {preview || <span className="italic text-zinc-600">empty</span>}
                                    </p>
                                </div>

                                {/* Image role dropdown */}
                                {isImage && isSelected && (
                                    <select
                                        value={imageRoles[node.id] ?? ''}
                                        onChange={e => {
                                            e.stopPropagation()
                                            setRole(node.id, e.target.value as ImageRole | '')
                                        }}
                                        onClick={e => e.stopPropagation()}
                                        className="bg-zinc-800 border border-zinc-600 rounded text-[10px] text-zinc-300 px-1 py-0.5 shrink-0 mt-0.5"
                                    >
                                        <option value="">no role</option>
                                        <option value="firstFrame">First Frame</option>
                                        <option value="lastFrame">Last Frame</option>
                                        <option value="reference">Reference</option>
                                    </select>
                                )}
                            </div>
                        )
                    })}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-800 shrink-0">
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-zinc-500">
                            {selectedIds.size} of {eligibleNodes.length} selected
                        </span>
                        <button
                            onClick={selectAll}
                            className="text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors"
                        >
                            Select All
                        </button>
                        <button
                            onClick={deselectAll}
                            className="text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors"
                        >
                            Deselect All
                        </button>
                    </div>

                    <button
                        onClick={handleExport}
                        disabled={selectedIds.size === 0 || isExporting}
                        className="px-3 py-1.5 rounded text-xs font-medium transition-colors bg-zinc-700 hover:bg-zinc-600 text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {isExporting ? 'Exporting...' : 'Export .md'}
                    </button>
                </div>

                {/* Error */}
                {error && (
                    <div className="px-5 py-2 text-xs text-red-400 border-t border-red-900/30">
                        {error}
                    </div>
                )}
            </div>
        </div>
    )
}