'use client'

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react'

// ===================================================
// NODE CONTENT — SEMANTIC LAYER (R4-004b v7)
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
    onContentMeasured?: (height: number) => void
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
    onContentMeasured,
}: NoteContentProps) {
    const titleRef = useRef<HTMLInputElement>(null)
    const bodyRef = useRef<HTMLTextAreaElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const lastMeasuredRef = useRef<number>(0)

    // ── DOM measurement: always, not just during editing ──
    // Measures the container's scrollHeight and emits if changed
    useLayoutEffect(() => {
        if (!containerRef.current || !onContentMeasured) return
        const measured = containerRef.current.scrollHeight
        if (measured > 0 && measured !== lastMeasuredRef.current) {
            lastMeasuredRef.current = measured
            onContentMeasured(measured)
        }
    })

    // ── Editing: auto-grow textarea ──
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
        if (e.key === 'Escape') onFieldBlur()
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
        <div ref={containerRef} className="w-full flex flex-col">
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

            <div className="p-2 break-words whitespace-pre-wrap">
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

// ── IMAGE (Blocco 4C: TakeBadge inside node) ──

export interface ImageData {
    src: string
    storage_path: string
    naturalWidth: number
    naturalHeight: number
}

interface ImageContentProps {
    data: ImageData & { selectionNumber?: number }
    isSelected?: boolean
    onRemoveBadge?: () => void
    onInspect?: () => void
}

export function ImageContent({ data, isSelected, onRemoveBadge, onInspect }: ImageContentProps) {
    return (
        <div
            className="w-full h-full flex items-center justify-center relative"
            onDoubleClick={(e) => { if (onInspect && data.src) { e.stopPropagation(); onInspect() } }}
        >
            <img
                src={data.src}
                className="w-full h-full object-contain pointer-events-none select-none"
                draggable={false}
                alt=""
            />
            {data.selectionNumber != null && (
                <>
                    <div className="absolute inset-0 border-2 border-amber-700/70 pointer-events-none" />
                    <span className="absolute top-1 right-1 z-10 flex items-center gap-0.5 select-none pointer-events-auto">
                        <span className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-500 text-zinc-300 text-[9px] font-mono rounded-sm pointer-events-none">
                            S{data.selectionNumber}
                        </span>
                        {isSelected && onRemoveBadge && (
                            <button
                                onPointerDown={(e) => { e.preventDefault(); e.stopPropagation() }}
                                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemoveBadge() }}
                                className="w-4 h-4 flex items-center justify-center bg-zinc-800 border border-zinc-600 hover:border-zinc-400 text-zinc-500 hover:text-zinc-200 text-[9px] rounded-sm transition-colors pointer-events-auto cursor-pointer"
                                title="Remove Selection Badge"
                            >✕</button>
                        )}
                    </span>
                </>
            )}
        </div>
    )
}

// ── COLUMN (R4-004b) ──

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
            {/* Column header — drag handle */}
            <div className="px-2 py-2 border-b border-zinc-600 flex items-center gap-1.5 cursor-grab active:cursor-grabbing">
                <span className="text-zinc-600 text-[8px] select-none flex-shrink-0">⠿</span>
                <button
                    onClick={handleToggleClick}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="text-zinc-500 hover:text-zinc-300 text-[10px] flex-shrink-0 w-4 h-4 flex items-center justify-center transition-colors"
                    title={isCollapsed ? 'Expand' : 'Collapse'}
                >
                    {isCollapsed ? '▶' : '▼'}
                </button>

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

            {/* Body — transparent, children are canvas nodes rendered on top */}
            {!isCollapsed && (
                <div className="flex-1" />
            )}
        </div>
    )
}

// ── VIDEO (Step 1A: Foundation) ──
// Inert by default — NodeShell receives all pointer events.
// Click play button: activates <video controls> for playback.
// Close button or Escape: returns to inert state.

export interface VideoData {
    src: string
    storage_path: string
    filename: string
    mime_type: string
    size?: number
    duration?: number
    thumbnail?: string
}

interface VideoContentProps {
    data: VideoData
    viewportScale?: number
}

export function VideoContent({ data, viewportScale = 1 }: VideoContentProps) {
    const [isPreview, setIsPreview] = useState(false)
    const videoRef = useRef<HTMLVideoElement>(null)

    useEffect(() => {
        if (!isPreview) return
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.stopPropagation(); setIsPreview(false) }
        }
        window.addEventListener('keydown', handleKey)
        return () => window.removeEventListener('keydown', handleKey)
    }, [isPreview])

    if (!data.src) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-black">
                <span className="text-zinc-600 text-xs">No video source</span>
            </div>
        )
    }

    return (
        <div className="w-full h-full bg-black relative">
            {!isPreview && (
                <>
                    {data.thumbnail ? (
                        <img
                            src={data.thumbnail}
                            className="w-full h-full object-contain pointer-events-none select-none"
                            draggable={false}
                            alt=""
                        />
                    ) : (
                        <video
                            src={data.src}
                            preload="metadata"

                            muted
                            className="w-full h-full object-contain pointer-events-none select-none"
                        />
                    )}

                    {/* Play button overlay */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <button
                            style={{ transform: `scale(${1 / viewportScale})` }}
                            className="w-12 h-12 rounded-full bg-black/60 border border-zinc-500 flex items-center justify-center pointer-events-auto hover:bg-black/80 hover:border-zinc-300 transition-colors cursor-pointer"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); setIsPreview(true) }}
                            title="Play video"
                        >
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                <path d="M6 4L16 10L6 16V4Z" fill="white" />
                            </svg>
                        </button>
                    </div>

                    {/* Filename label */}
                    {data.filename && (
                        <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-black/70 pointer-events-none">
                            <span className="text-[9px] text-zinc-400 truncate block">{data.filename}</span>
                        </div>
                    )}
                </>
            )}

            {isPreview && (
                <div className="w-full h-full relative">
                    <video
                        ref={videoRef}
                        src={data.src}
                        controls
                        autoPlay
                        className="w-full h-full object-contain"
                        onMouseDown={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                    />
                    <button
                        style={{ transform: `scale(${1 / viewportScale})`, transformOrigin: 'top right' }}
                        className="absolute top-1 right-1 z-20 w-5 h-5 rounded bg-black/70 border border-zinc-600 text-zinc-400 hover:text-white text-[10px] flex items-center justify-center pointer-events-auto cursor-pointer"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); setIsPreview(false) }}
                        title="Close player"
                    >✕</button>
                </div>
            )}
        </div>
    )
}