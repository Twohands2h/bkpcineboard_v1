'use client'

import { useEffect, useCallback } from 'react'

interface ConfirmModalProps {
    title: string
    body: string
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
    onConfirm: () => void
    onCancel: () => void
}

export function ConfirmModal({
    title,
    body,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = false,
    onConfirm,
    onCancel,
}: ConfirmModalProps) {
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') onCancel()
    }, [onCancel])

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [handleKeyDown])

    return (
        <div
            className="fixed inset-0 z-[99998] bg-black/60 flex items-center justify-center"
            onClick={onCancel}
        >
            <div
                className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-xl max-w-[480px] w-full mx-4 p-6"
                onClick={e => e.stopPropagation()}
            >
                <h2 className="text-zinc-100 text-base font-semibold mb-2">{title}</h2>
                <p className="text-zinc-400 text-sm whitespace-pre-line mb-6">{body}</p>
                <div className="flex justify-end gap-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm text-zinc-400 bg-zinc-800 border border-zinc-600 rounded-lg hover:bg-zinc-700 transition-colors"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${danger
                                ? 'text-red-100 bg-red-600 hover:bg-red-500 border border-red-500'
                                : 'text-zinc-100 bg-blue-600 hover:bg-blue-500 border border-blue-500'
                            }`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}