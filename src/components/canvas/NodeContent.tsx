'use client'

import { useRef, useEffect, useCallback } from 'react'

// ===================================================
// NODE CONTENT — SEMANTIC LAYER (R4-001a)
// ===================================================
// TRASPARENTE. Lo stile visivo (bg, border, shadow) è sul NodeShell.
// Questo componente riempie lo spazio e mostra il contenuto.

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
}

export function NoteContent({
    data,
    isEditing,
    editingField,
    onDataChange,
    onFieldFocus,
    onFieldBlur,
    onStartEditing,
}: NoteContentProps) {
    const titleRef = useRef<HTMLInputElement>(null)
    const bodyRef = useRef<HTMLTextAreaElement>(null)

    const adjustTextareaHeight = useCallback(() => {
        const el = bodyRef.current
        if (!el) return
        el.style.height = 'auto'
        el.style.height = `${el.scrollHeight}px`
    }, [])

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
            setTimeout(adjustTextareaHeight, 0)
        }
    }, [isEditing, editingField, adjustTextareaHeight])

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
            {/* Header / Title */}
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

            {/* Body */}
            <div className="p-2 flex-1 break-words whitespace-pre-wrap">
                {isEditing && editingField === 'body' ? (
                    <textarea
                        ref={bodyRef}
                        placeholder="Write something..."
                        value={data.body || ''}
                        onChange={(e) => {
                            adjustTextareaHeight()
                            handleBodyChange(e)
                        }}
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