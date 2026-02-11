'use client'

import { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

// ===================================================
// PROMPT CONTENT — BLOCCO 4 (MEMORY NODE)
// ===================================================
// Il Prompt Node è un nodo semantico che RICORDA, non genera.
// Memorizza il testo del prompt, il tipo, e la provenienza.
// "Does this preserve the film's memory?" → Sì.
//
// Input Isolation: keydown/keyup stopPropagation su TUTTI gli input.
// Quando si scrive, il canvas tace. (Costituzionale)
//
// Retrocompatibilità: campi mancanti → fallback visivo, NO mutazione on mount.
// Default assegnati SOLO in createPromptNodeAt (TakeCanvas).

// ── Canonical Types ──

export type PromptType = 'master' | 'prompt' | 'negative' | 'pre-prompt' | 'post-prompt'

// Origin is an open string — dropdown is UX convenience, not a closed enum.
// Known values get nice labels; unknown values display as-is (retrocompat).

export interface PromptData {
    title?: string
    body?: string
    promptType?: PromptType
    origin?: string
    createdAt?: string  // ISO timestamp, set once at creation, never updated
}

// ── UI Labels (display only) ──

const PROMPT_TYPE_LABELS: Record<PromptType, string> = {
    'master': 'Master Prompt',
    'prompt': 'Prompt',
    'negative': 'Negative Prompt',
    'pre-prompt': 'Pre-Prompt',
    'post-prompt': 'Post-Prompt',
}

// Known origins: dropdown shows these + "Altro..." sentinel.
// Storage is always a plain string — the dropdown is just UX sugar.
const KNOWN_ORIGINS: { value: string; label: string }[] = [
    { value: 'manual', label: 'Manual' },
    { value: 'claude', label: 'Claude' },
    { value: 'chatgpt', label: 'ChatGPT' },
    { value: 'gemini', label: 'Gemini' },
    { value: 'midjourney', label: 'Midjourney' },
    { value: 'runway', label: 'Runway' },
    { value: 'veo', label: 'Veo' },
    { value: 'comfyui', label: 'ComfyUI' },
    { value: 'kling', label: 'Kling' },
]
const ALTRO_SENTINEL = '__altro__'

// Format ISO timestamp to compact readable date (e.g. "Feb 11, 2026")
function formatCreatedAt(iso: string): string {
    try {
        const d = new Date(iso)
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } catch {
        return ''
    }
}

const PROMPT_TYPES = Object.keys(PROMPT_TYPE_LABELS) as PromptType[]

// ── InfoTip: Portal-based tooltip (escapes overflow clip) ──

function InfoTip({ text }: { text: string }) {
    const triggerRef = useRef<HTMLSpanElement>(null)
    const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

    const handleEnter = useCallback(() => {
        const el = triggerRef.current
        if (!el) return
        const r = el.getBoundingClientRect()
        setPos({ x: r.left + r.width / 2, y: r.top })
    }, [])

    const handleLeave = useCallback(() => setPos(null), [])

    return (
        <>
            <span
                ref={triggerRef}
                className="inline-flex items-center justify-center w-3 h-3 rounded-full border border-zinc-600 text-zinc-500 hover:text-zinc-300 hover:border-zinc-400 cursor-default select-none leading-none"
                style={{ fontSize: '8px' }}
                onMouseEnter={handleEnter}
                onMouseLeave={handleLeave}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
            >i</span>
            {pos && createPortal(
                <div
                    className="fixed px-1.5 py-0.5 bg-zinc-800 border border-zinc-600 text-zinc-300 rounded whitespace-nowrap pointer-events-none z-[99999]"
                    style={{ fontSize: '9px', left: pos.x, top: pos.y, transform: 'translate(-50%, -100%) translateY(-4px)' }}
                >{text}</div>,
                document.body
            )}
        </>
    )
}

// ── Component ──

interface PromptContentProps {
    data: PromptData
    isEditing: boolean
    editingField: 'title' | 'body' | null
    onDataChange: (data: PromptData) => void
    onStartEditing: (field: 'title' | 'body') => void
    onFieldBlur: () => void
    onRequestHeight?: (height: number) => void
    onContentMeasured?: (height: number) => void
}

export function PromptContent({
    data,
    isEditing,
    editingField,
    onDataChange,
    onStartEditing,
    onFieldBlur,
    onRequestHeight,
    onContentMeasured,
}: PromptContentProps) {
    const titleRef = useRef<HTMLInputElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const measureRef = useRef<HTMLDivElement>(null)
    const customOriginInputRef = useRef<HTMLInputElement>(null)
    const lastMeasuredRef = useRef<number>(0)

    // "Altro..." custom input state (local UI only, not persisted until commit)
    const [customOriginActive, setCustomOriginActive] = useState(false)
    const [customOriginDraft, setCustomOriginDraft] = useState('')

    const editingTitle = isEditing && editingField === 'title'
    const editingBody = isEditing && editingField === 'body'

    // Fallback visuals for missing fields (NO mutation — just display defaults)
    const displayType = data.promptType ?? 'prompt'
    const displayOrigin = data.origin ?? 'manual'

    // ── DOM measurement (same as NoteContent) ──
    useLayoutEffect(() => {
        if (!measureRef.current || !onContentMeasured) return
        const measured = measureRef.current.scrollHeight
        if (measured > 0 && measured !== lastMeasuredRef.current) {
            lastMeasuredRef.current = measured
            onContentMeasured(measured)
        }
    })

    // ── Auto-grow textarea (same as NoteContent) ──
    const measureAndRequest = useCallback((force = false) => {
        if (!isEditing && !force) return
        const el = textareaRef.current
        if (!el || !onRequestHeight) return
        el.style.height = 'auto'
        const neededHeight = el.scrollHeight
        // Header (~32) + title (~28) + padding (~16) + footer (~20) = ~96
        onRequestHeight(neededHeight + 96)
        el.style.height = `${neededHeight}px`
    }, [isEditing, onRequestHeight])

    // ── Focus on edit start (same pattern as NoteContent) ──
    useEffect(() => {
        if (isEditing) {
            if (editingField === 'title' && titleRef.current) {
                titleRef.current.focus()
                titleRef.current.select()
            } else if (editingField === 'body' && textareaRef.current) {
                textareaRef.current.focus()
                textareaRef.current.select()
            }
        }
    }, [isEditing, editingField])

    useEffect(() => {
        if (isEditing && editingField === 'body') {
            setTimeout(() => measureAndRequest(true), 0)
        }
    }, [isEditing, editingField, measureAndRequest])

    useEffect(() => {
        if (customOriginActive && customOriginInputRef.current) {
            customOriginInputRef.current.focus()
        }
    }, [customOriginActive])

    // INPUT ISOLATION — CRITICO (Costituzionale)
    // Quando si scrive, il canvas tace.
    const stopKeyPropagation = useCallback((e: React.KeyboardEvent) => {
        e.stopPropagation()
    }, [])

    // ── Title ──
    const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        onDataChange({ ...data, title: e.target.value })
    }, [data, onDataChange])

    const handleTitleDoubleClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        onStartEditing('title')
    }, [onStartEditing])

    const handleTitleBlur = useCallback(() => {
        onFieldBlur()
    }, [onFieldBlur])

    // ── Body ──
    const handleBodyChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onDataChange({ ...data, body: e.target.value })
    }, [data, onDataChange])

    const handleBodyDoubleClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        onStartEditing('body')
    }, [onStartEditing])

    const handleBodyBlur = useCallback(() => {
        onFieldBlur()
    }, [onFieldBlur])

    // ── Dropdowns ──
    const handlePromptTypeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        e.stopPropagation()
        onDataChange({ ...data, promptType: e.target.value as PromptType })
    }, [data, onDataChange])

    // Origin: open string. Dropdown always visible.
    // Known origin → dropdown shows it. Custom origin → dropdown shows "Altro…" + input appears.
    const isKnownOrigin = KNOWN_ORIGINS.some(o => o.value === displayOrigin)
    // Show custom input if: origin is custom string, OR user just clicked "Altro..."
    const showCustomInput = customOriginActive || (!isKnownOrigin && displayOrigin !== '')
    // Dropdown value: known origin → that value, custom → sentinel
    const dropdownValue = isKnownOrigin ? displayOrigin : ALTRO_SENTINEL

    const handleOriginDropdownChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        e.stopPropagation()
        const val = e.target.value
        if (val === ALTRO_SENTINEL) {
            setCustomOriginActive(true)
            setCustomOriginDraft(isKnownOrigin ? '' : displayOrigin)
        } else {
            setCustomOriginActive(false)
            setCustomOriginDraft('')
            onDataChange({ ...data, origin: val })
        }
    }, [data, onDataChange, isKnownOrigin, displayOrigin])

    const handleCustomOriginChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        setCustomOriginDraft(val)
        // Live update origin as user types (so it persists even without explicit commit)
        if (val.trim()) {
            onDataChange({ ...data, origin: val.trim() })
        }
    }, [data, onDataChange])

    const handleCustomOriginBlur = useCallback(() => {
        const trimmed = customOriginDraft.trim()
        if (!trimmed) {
            // Empty custom → revert to manual
            onDataChange({ ...data, origin: 'manual' })
        }
        setCustomOriginActive(false)
        setCustomOriginDraft('')
    }, [data, onDataChange, customOriginDraft])

    const handleCustomOriginKeyDown = useCallback((e: React.KeyboardEvent) => {
        e.stopPropagation()
        if (e.key === 'Enter') { (e.target as HTMLInputElement).blur() }
        if (e.key === 'Escape') { setCustomOriginActive(false); setCustomOriginDraft('') }
    }, [])

    return (
        <div ref={measureRef} className="w-full flex flex-col">
            {/* Header: Type badge + Origin */}
            <div
                className="flex items-center justify-between px-2 py-1.5 border-b border-zinc-700 bg-zinc-900/50 shrink-0 gap-2"
            >
                {/* Prompt Type dropdown + ⓘ */}
                <div className="flex items-center gap-1">
                    <select
                        value={displayType}
                        onChange={handlePromptTypeChange}
                        onKeyDown={stopKeyPropagation}
                        onKeyUp={stopKeyPropagation}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="text-[10px] bg-amber-900/40 text-amber-400 border border-amber-800/50 rounded px-1 py-0.5 outline-none cursor-pointer appearance-auto"
                    >
                        {PROMPT_TYPES.map(t => (
                            <option key={t} value={t}>{PROMPT_TYPE_LABELS[t]}</option>
                        ))}
                    </select>
                    <InfoTip text="Ruolo del prompt nel processo creativo" />
                </div>

                {/* Origin: dropdown always visible + ⓘ + custom input when "Altro..." */}
                <div className="flex items-center gap-1">
                    <select
                        value={dropdownValue}
                        onChange={handleOriginDropdownChange}
                        onKeyDown={stopKeyPropagation}
                        onKeyUp={stopKeyPropagation}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700 rounded px-1 py-0.5 outline-none cursor-pointer appearance-auto"
                    >
                        {KNOWN_ORIGINS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                        <option value={ALTRO_SENTINEL}>Altro…</option>
                    </select>
                    <InfoTip text="Strumento o contesto di provenienza" />
                    {showCustomInput && (
                        <input
                            ref={customOriginInputRef}
                            type="text"
                            value={customOriginActive ? customOriginDraft : displayOrigin}
                            onChange={handleCustomOriginChange}
                            onKeyDown={handleCustomOriginKeyDown}
                            onKeyUp={stopKeyPropagation}
                            onBlur={handleCustomOriginBlur}
                            onMouseDown={(e) => e.stopPropagation()}
                            placeholder="Tool…"
                            className="text-[10px] bg-zinc-800 text-zinc-300 border border-zinc-600 rounded px-1 py-0.5 outline-none w-[72px]"
                            spellCheck={false}
                        />
                    )}
                </div>
            </div>

            {/* Title — editable inline */}
            <div
                className="px-2 pt-1.5 pb-1 shrink-0"
                onDoubleClick={handleTitleDoubleClick}
            >
                {editingTitle ? (
                    <input
                        ref={titleRef}
                        type="text"
                        value={data.title ?? ''}
                        onChange={handleTitleChange}
                        onKeyDown={stopKeyPropagation}
                        onKeyUp={stopKeyPropagation}
                        onBlur={handleTitleBlur}
                        placeholder="Titolo prompt…"
                        autoFocus
                        className="w-full bg-transparent text-zinc-200 text-xs font-medium outline-none placeholder-zinc-600 border-b border-zinc-700 pb-0.5"
                        spellCheck={false}
                    />
                ) : (
                    <div className="text-zinc-300 text-xs font-medium cursor-text min-h-[1.2em] truncate">
                        {data.title || (
                            <span className="text-zinc-600 italic">Titolo prompt…</span>
                        )}
                    </div>
                )}
            </div>

            {/* Body — NoteContent pattern: auto-grow textarea in editing */}
            <div className="p-2 break-words whitespace-pre-wrap" onDoubleClick={handleBodyDoubleClick}>
                {editingBody ? (
                    <textarea
                        ref={textareaRef}
                        value={data.body ?? ''}
                        onChange={(e) => {
                            handleBodyChange(e)
                            measureAndRequest()
                        }}
                        onFocus={() => measureAndRequest(true)}
                        onKeyDown={stopKeyPropagation}
                        onKeyUp={stopKeyPropagation}
                        onBlur={handleBodyBlur}
                        onMouseDown={(e) => e.stopPropagation()}
                        placeholder="Scrivi il prompt qui…"
                        className="w-full bg-transparent text-zinc-200 text-sm outline-none resize-none overflow-hidden placeholder-zinc-600"
                        rows={1}
                        spellCheck={false}
                    />
                ) : (
                    <div className="text-zinc-300 text-sm cursor-text min-h-[2em]">
                        {data.body || (
                            <span className="text-zinc-600 italic">Scrivi il prompt qui…</span>
                        )}
                    </div>
                )}
            </div>

            {/* Created at — read-only, immutable */}
            {data.createdAt && (
                <div className="px-2 py-0.5 border-t border-zinc-800">
                    <span className="text-[9px] text-zinc-600 select-none whitespace-nowrap truncate block">
                        {formatCreatedAt(data.createdAt)}
                    </span>
                </div>
            )}
        </div>
    )
}