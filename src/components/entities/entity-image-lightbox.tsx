'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

interface EntityImageLightboxProps {
    src: string
    filename?: string
    onClose: () => void
}

/**
 * Fullscreen image lightbox with zoom/pan.
 * Portaled to document.body — works from any container (drawer, inspector, etc).
 * - Click backdrop → close
 * - Double-click image → toggle 1x ↔ 2x zoom
 * - Drag when zoomed → pan
 * - Escape → close
 */
export function EntityImageLightbox({ src, filename, onClose }: EntityImageLightboxProps) {
    const [scale, setScale] = useState(1)
    const [translate, setTranslate] = useState({ x: 0, y: 0 })
    const dragRef = useRef<{ startX: number; startY: number; startTx: number; startTy: number } | null>(null)
    const imgRef = useRef<HTMLImageElement>(null)

    // Reset on src change
    useEffect(() => {
        setScale(1)
        setTranslate({ x: 0, y: 0 })
    }, [src])

    // Escape to close
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [onClose])

    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        if (scale === 1) {
            setScale(2)
            setTranslate({ x: 0, y: 0 })
        } else {
            setScale(1)
            setTranslate({ x: 0, y: 0 })
        }
    }, [scale])

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (scale <= 1) return
        e.preventDefault()
        dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            startTx: translate.x,
            startTy: translate.y,
        }
    }, [scale, translate])

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!dragRef.current) return
            const dx = e.clientX - dragRef.current.startX
            const dy = e.clientY - dragRef.current.startY
            setTranslate({
                x: dragRef.current.startTx + dx,
                y: dragRef.current.startTy + dy,
            })
        }
        const handleMouseUp = () => { dragRef.current = null }
        window.addEventListener('mousemove', handleMouseMove)
        window.addEventListener('mouseup', handleMouseUp)
        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
        }
    }, [])

    // Wheel zoom
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.stopPropagation()
        const delta = e.deltaY > 0 ? -0.2 : 0.2
        setScale(prev => Math.max(0.5, Math.min(5, prev + delta)))
    }, [])

    return createPortal(
        <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/85"
            onClick={onClose}
            onWheel={handleWheel}
        >
            {/* Close hint */}
            <div className="absolute top-4 right-4 z-10">
                <button
                    onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800/80 border border-zinc-700 text-zinc-400 hover:text-white transition-colors text-sm"
                >
                    ✕
                </button>
            </div>

            {/* Zoom indicator */}
            {scale !== 1 && (
                <div className="absolute top-4 left-4 z-10 px-2 py-1 bg-zinc-800/80 border border-zinc-700 rounded text-[10px] text-zinc-400">
                    {Math.round(scale * 100)}%
                </div>
            )}

            {/* Filename */}
            {filename && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 px-3 py-1 bg-zinc-800/80 border border-zinc-700 rounded text-[10px] text-zinc-500 truncate max-w-[50vw]">
                    {filename}
                </div>
            )}

            <img
                ref={imgRef}
                src={src}
                alt={filename ?? ''}
                className="max-w-[90vw] max-h-[90vh] object-contain select-none"
                style={{
                    transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
                    cursor: scale > 1 ? 'grab' : 'zoom-in',
                    transition: dragRef.current ? 'none' : 'transform 0.15s ease-out',
                }}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={handleDoubleClick}
                onMouseDown={handleMouseDown}
                draggable={false}
            />
        </div>,
        document.body
    )
}
