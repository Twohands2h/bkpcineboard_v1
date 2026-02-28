'use client'

import { useMemo } from 'react'
import type { CanvasNode } from '@/components/canvas/TakeCanvas'

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
}

// ── Component ──

export function InspectorPanel({ node, onClose }: InspectorPanelProps) {
    const filename = useMemo(() => node ? humanFilename(node.data as any) : null, [node])
    const dimensions = useMemo(() => node ? formatDimensions(node) : null, [node])
    const data = (node?.data ?? {}) as Record<string, any>

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

                            {/* Provenance */}
                            <Section label="Generated With">
                                <Value>{data.generated_with ?? '—'}</Value>
                            </Section>

                            <Section label="Tool Origin">
                                <Value>{data.tool_origin ?? '—'}</Value>
                            </Section>

                            {/* Source */}
                            {(data.storage_path || data.src) && (
                                <Section label="Source">
                                    <div className="flex items-start gap-1">
                                        <span className="text-[11px] text-zinc-400 break-all flex-1 select-text">
                                            {data.storage_path || data.src}
                                        </span>
                                        <button
                                            onClick={() => copyToClipboard(data.storage_path || data.src)}
                                            className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700/60 transition-colors"
                                            title="Copy"
                                        >
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                            </svg>
                                        </button>
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
                                    <button
                                        onClick={() => copyToClipboard(node.id)}
                                        className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700/60 transition-colors"
                                        title="Copy ID"
                                    >
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                        </svg>
                                    </button>
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