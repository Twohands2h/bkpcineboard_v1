'use client'

import { useRef, useEffect, useCallback } from 'react'

// ===================================================
// NODE CONTENT — SEMANTIC LAYER (R4-004a)
// ===================================================

// ── NOTE ──

export interface NoteData {
    title?: string
    body?: string
}

interface NoteContentProps {
    data: NoteData
    isEditing: boolean
    editingField: 'title' | 'body' | null
    onDataChange: (data: NoteData) => void
    onFieldFocus: (field: 'title' | 'body') => void
    onFieldBlur: () => void
    onStartEditing: (field: 'title' | 'body') => void
    onRequestHeight?: (height: number) => void
}

export function NoteContent({
    data,
    isEditing,
    editingField,
    onDataChange,
    onFieldFocus,
    onFieldBlur,
    onStartEditing,
    onRequestHeight,
}: NoteContentProps) {
    const titleRef = useRef<HTMLInputElement>(null)
    const bodyRef = useRef<HTMLTextAreaElement>(null)

    const measureAndRequest = useCallback((force = false) => {
        if (!isEditing && !force) return

        const el = bodyRef.current
        if (!el || !onRequestHeight) return

        el.style.height = 'auto'
        const neededHeight = el.scrollHeight
        onRequestHeight(neededHeight + 44)
        el.style.height = `${neededHeight}px`
    }, [isEditing, onRequestHeight])

    useEffect(() => {
        if (isEditing) {
            if (editingField === 'title' && titleRef.current) {
                titleRef.current.focus()
                titleRef.current.select()
            } else if (editingField === 'body' && bodyRef.current) {
                bodyRef.current.focus()
                bodyRef.current.select()
            }
        }
    }, [isEditing, editingField])

    useEffect(() => {
        if (isEditing && editingField === 'body') {
            setTimeout(() => measureAndRequest(true), 0)
        }
    }, [isEditing, editingField, measureAndRequest])

    const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onDataChange({ ...data, title: e.target.value })
    }

    const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onDataChange({ ...data, body: e.target.value })
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            onFieldBlur()
        }
    }

    const handleTitleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        onStartEditing('title')
    }

    const handleBodyDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        onStartEditing('body')
    }

    return (
        <div className="w-full h-full flex flex-col">
            <div className="px-2 py-1 border-b border-zinc-700">
                {isEditing && editingField === 'title' ? (
                    <input
                        ref={titleRef}
                        type="text"
                        placeholder="Title"
                        value={data.title || ''}
                        onChange={handleTitleChange}
                        onBlur={onFieldBlur}
                        onKeyDown={handleKeyDown}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="bg-transparent text-xs text-zinc-300 font-medium w-full outline-none placeholder-zinc-600"
                    />
                ) : (
                    <div
                        className="text-xs text-zinc-300 font-medium truncate cursor-text"
                        onDoubleClick={handleTitleDoubleClick}
                    >
                        {data.title || 'Untitled'}
                    </div>
                )}
            </div>

            <div className="p-2 flex-1 break-words whitespace-pre-wrap">
                {isEditing && editingField === 'body' ? (
                    <textarea
                        ref={bodyRef}
                        placeholder="Write something..."
                        value={data.body || ''}
                        onChange={(e) => {
                            handleBodyChange(e)
                            measureAndRequest()
                        }}
                        onFocus={() => measureAndRequest(true)}
                        onBlur={onFieldBlur}
                        onKeyDown={handleKeyDown}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-full bg-transparent text-xs text-zinc-400 outline-none resize-none overflow-hidden placeholder-zinc-600"
                        rows={1}
                    />
                ) : (
                    <div
                        className="text-xs text-zinc-400 cursor-text"
                        onDoubleClick={handleBodyDoubleClick}
                    >
                        {data.body || <span className="text-zinc-600">Double-click to edit</span>}
                    </div>
                )}
            </div>
        </div>
    )
}

// ── IMAGE ──

export interface ImageData {
    src: string
    storage_path: string
    naturalWidth: number
    naturalHeight: number
}

interface ImageContentProps {
    data: ImageData
}

export function ImageContent({ data }: ImageContentProps) {
    return (
        <div className="w-full h-full flex items-center justify-center">
            <img
                src={data.src}
                className="w-full h-full object-contain pointer-events-none select-none"
                draggable={false}
                alt=""
            />
        </div>
    )
}

// ── COLUMN (R4-004a) ──

export interface ColumnData {
    title?: string
    collapsed?: boolean
}

interface ColumnContentProps {
    data: ColumnData
    isEditing: boolean
    editingField: 'title' | 'body' | null
    onDataChange: (data: ColumnData) => void
    onFieldBlur: () => void
    onStartEditing: (field: 'title' | 'body') => void
    onToggleCollapse: () => void
}

export function ColumnContent({
    data,
    isEditing,
    editingField,
    onDataChange,
    onFieldBlur,
    onStartEditing,
    onToggleCollapse,
}: ColumnContentProps) {
    const titleRef = useRef<HTMLInputElement>(null)
    const isCollapsed = data.collapsed ?? false

    useEffect(() => {
        if (isEditing && editingField === 'title' && titleRef.current) {
            titleRef.current.focus()
            titleRef.current.select()
        }
    }, [isEditing, editingField])

    const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onDataChange({ ...data, title: e.target.value })
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') onFieldBlur()
        if (e.key === 'Enter') onFieldBlur()
    }

    const handleTitleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        onStartEditing('title')
    }

    const handleToggleClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        onToggleCollapse()
    }

    return (
        <div className="w-full h-full flex flex-col">
            {/* Column header */}
            <div className="px-2 py-1.5 border-b border-zinc-600 flex items-center gap-1.5">
                {/* Collapse toggle */}
                <button
                    onClick={handleToggleClick}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="text-zinc-500 hover:text-zinc-300 text-[10px] flex-shrink-0 w-4 h-4 flex items-center justify-center transition-colors"
                    title={isCollapsed ? 'Expand' : 'Collapse'}
                >
                    {isCollapsed ? '▶' : '▼'}
                </button>

                {/* Title */}
                {isEditing && editingField === 'title' ? (
                    <input
                        ref={titleRef}
                        type="text"
                        placeholder="Column"
                        value={data.title || ''}
                        onChange={handleTitleChange}
                        onBlur={onFieldBlur}
                        onKeyDown={handleKeyDown}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="bg-transparent text-xs text-zinc-200 font-semibold w-full outline-none placeholder-zinc-600"
                    />
                ) : (
                    <div
                        className="text-xs text-zinc-200 font-semibold truncate cursor-text flex-1"
                        onDoubleClick={handleTitleDoubleClick}
                    >
                        {data.title || 'Column'}
                    </div>
                )}
            </div>

            {/* Body area — visible only when expanded */}
            {!isCollapsed && (
                <div className="flex-1 p-1">
                    <div className="w-full h-full border border-dashed border-zinc-700 flex items-center justify-center">
                        <span className="text-[10px] text-zinc-600">drop zone (R4-004b)</span>
                    </div>
                </div>
            )}
        </div>
    )
}