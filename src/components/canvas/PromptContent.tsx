'use client'

import { useCallback, useRef, useEffect } from 'react'

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
export type PromptOrigin = 'manual' | 'midjourney' | 'runway' | 'veo' | 'comfyui' | 'kling' | 'altro'

export interface PromptData {
    title?: string
    body?: string
    promptType?: PromptType
    origin?: PromptOrigin
}

// ── UI Labels (display only) ──

const PROMPT_TYPE_LABELS: Record<PromptType, string> = {
    'master': 'Master Prompt',
    'prompt': 'Prompt',
    'negative': 'Negative Prompt',
    'pre-prompt': 'Pre-Prompt',
    'post-prompt': 'Post-Prompt',
}

const ORIGIN_LABELS: Record<PromptOrigin, string> = {
    'manual': 'Manual',
    'midjourney': 'Midjourney',
    'runway': 'Runway',
    'veo': 'Veo',
    'comfyui': 'ComfyUI',
    'kling': 'Kling',
    'altro': 'Altro',
}

const PROMPT_TYPES = Object.keys(PROMPT_TYPE_LABELS) as PromptType[]
const ORIGINS = Object.keys(ORIGIN_LABELS) as PromptOrigin[]

// ── Component ──

interface PromptContentProps {
    data: PromptData
    isEditing: boolean
    editingField: 'title' | 'body' | null
    onDataChange: (data: PromptData) => void
    onStartEditing: (field: 'title' | 'body') => void
    onFieldBlur: () => void
    onContentMeasured?: (height: number) => void
}

export function PromptContent({
    data,
    isEditing,
    editingField,
    onDataChange,
    onStartEditing,
    onFieldBlur,
    onContentMeasured,
}: PromptContentProps) {
    const titleRef = useRef<HTMLInputElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const measureRef = useRef<HTMLDivElement>(null)

    const editingTitle = isEditing && editingField === 'title'
    const editingBody = isEditing && editingField === 'body'

    useEffect(() => {
        if (editingTitle && titleRef.current) {
            titleRef.current.focus()
            const len = titleRef.current.value.length
            titleRef.current.setSelectionRange(len, len)
        }
    }, [editingTitle])

    useEffect(() => {
        if (editingBody && textareaRef.current) {
            textareaRef.current.focus()
            const len = textareaRef.current.value.length
            textareaRef.current.setSelectionRange(len, len)
        }
    }, [editingBody])

    useEffect(() => {
        if (measureRef.current && onContentMeasured) {
            onContentMeasured(measureRef.current.scrollHeight)
        }
    })

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

    const handleOriginChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        e.stopPropagation()
        onDataChange({ ...data, origin: e.target.value as PromptOrigin })
    }, [data, onDataChange])

    // Fallback visuals for missing fields (NO mutation — just display defaults)
    const displayType = data.promptType ?? 'prompt'
    const displayOrigin = data.origin ?? 'manual'

    return (
        <div ref={measureRef} className="flex flex-col h-full">
            {/* Header: Type badge + Origin */}
            <div
                className="flex items-center justify-between px-2 py-1.5 border-b border-zinc-700 bg-zinc-900/50 shrink-0 gap-2"
                onMouseDown={(e) => e.stopPropagation()}
            >
                {/* Prompt Type dropdown */}
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

                {/* Origin dropdown */}
                <select
                    value={displayOrigin}
                    onChange={handleOriginChange}
                    onKeyDown={stopKeyPropagation}
                    onKeyUp={stopKeyPropagation}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700 rounded px-1 py-0.5 outline-none cursor-pointer appearance-auto"
                >
                    {ORIGINS.map(o => (
                        <option key={o} value={o}>{ORIGIN_LABELS[o]}</option>
                    ))}
                </select>
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

            {/* Body — multiline textarea (taccuino) */}
            <div className="flex-1 min-h-0 px-2 pb-2" onDoubleClick={handleBodyDoubleClick}>
                {editingBody ? (
                    <textarea
                        ref={textareaRef}
                        value={data.body ?? ''}
                        onChange={handleBodyChange}
                        onKeyDown={stopKeyPropagation}
                        onKeyUp={stopKeyPropagation}
                        onBlur={handleBodyBlur}
                        placeholder="Scrivi il prompt qui…"
                        autoFocus
                        className="w-full h-full bg-transparent text-zinc-200 text-sm resize-none outline-none placeholder-zinc-600"
                        spellCheck={false}
                    />
                ) : (
                    <div className="text-zinc-300 text-sm whitespace-pre-wrap break-words cursor-text min-h-[2em]">
                        {data.body || (
                            <span className="text-zinc-600 italic">Scrivi il prompt qui…</span>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}