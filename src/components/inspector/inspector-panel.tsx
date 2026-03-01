'use client'

import { useState, useMemo, useCallback } from 'react'
import type { CanvasNode } from '@/components/canvas/TakeCanvas'
import {
    IMAGE_GENERATED_WITH_OPTIONS,
    VIDEO_GENERATED_WITH_OPTIONS,
    normalizeProvenanceValue,
} from '@/lib/provenance-options'

// ── Helpers ──

function humanType(node: CanvasNode): string {
    switch (node.type) {
        case 'image': return 'Image'
        case 'video': return 'Video'
        case 'note': return 'Note'
        case 'column': return 'Column'
        case 'prompt': return 'Prompt'
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
}

// ── Component ──

export function InspectorPanel({ node, onClose, onUpdateNodeData, onOpenEntityEdit }: InspectorPanelProps) {

    const filename = useMemo(() => node ? humanFilename(node.data as any) : null, [node])
    const dimensions = useMemo(() => node ? formatDimensions(node) : null, [node])
    const data = (node?.data ?? {}) as Record<string, any>

    const showGeneratedWith = node?.type === 'image' || node?.type === 'video'
    const showToolOrigin = node?.type === 'prompt'

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
                    ) : (
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