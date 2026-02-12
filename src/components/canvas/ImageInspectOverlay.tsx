'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'

// ===================================================
// IMAGE INSPECT OVERLAY — R4.0a
// ===================================================
// Fullscreen lightbox for millimetric image inspection.
// No mutation, no DB write, no canvas interaction while open.
// Portal on document.body — above everything.

interface ImageInspectOverlayProps {
    src: string
    naturalWidth: number
    naturalHeight: number
    onClose: () => void
}

export function ImageInspectOverlay({ src, naturalWidth, naturalHeight, onClose }: ImageInspectOverlayProps) {
    const [mode, setMode] = useState<'fit' | '100'>('fit')
    const [pan, setPan] = useState({ x: 0, y: 0 })
    const [zoom, setZoom] = useState(1)
    const containerRef = useRef<HTMLDivElement>(null)
    const imageAreaRef = useRef<HTMLDivElement>(null)
    const panRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null)
    const didDragRef = useRef(false)

    // ESC to close
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [onClose])

    // Block browser zoom AND apply our zoom — single document-level capture handler.
    // Must be capture phase to intercept before browser processes Ctrl+wheel.
    useEffect(() => {
        const el = imageAreaRef.current
        const handler = (e: WheelEvent) => {
            e.preventDefault()
            e.stopPropagation()
            e.stopImmediatePropagation()
            // Only zoom if wheel is over the image area
            if (el && el.contains(e.target as Node)) {
                const factor = e.deltaY > 0 ? 0.97 : 1.03
                setZoom(z => Math.min(Math.max(z * factor, 0.1), 5))
                setMode('100')
            }
        }
        document.addEventListener('wheel', handler, { passive: false, capture: true })
        return () => document.removeEventListener('wheel', handler, { capture: true })
    }, [])

    // Compute fit scale
    const getFitScale = useCallback(() => {
        if (!containerRef.current) return 1
        const cr = containerRef.current.getBoundingClientRect()
        const pad = 48
        const maxW = cr.width - pad * 2
        const maxH = cr.height - pad * 2
        return Math.min(maxW / naturalWidth, maxH / naturalHeight, 1)
    }, [naturalWidth, naturalHeight])

    // Switch modes
    const handleFit = useCallback(() => {
        setMode('fit')
        setZoom(getFitScale())
        setPan({ x: 0, y: 0 })
    }, [getFitScale])

    const handleActualSize = useCallback(() => {
        setMode('100')
        setZoom(1)
        setPan({ x: 0, y: 0 })
    }, [])

    // Init fit on mount
    useEffect(() => {
        const t = setTimeout(() => setZoom(getFitScale()), 0)
        return () => clearTimeout(t)
    }, [getFitScale])

    // Pan with drag
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return
        e.preventDefault()
        didDragRef.current = false
        panRef.current = { startX: e.clientX, startY: e.clientY, startPanX: pan.x, startPanY: pan.y }

        const handleMove = (ev: MouseEvent) => {
            if (!panRef.current) return
            const dx = ev.clientX - panRef.current.startX
            const dy = ev.clientY - panRef.current.startY
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDragRef.current = true
            setPan({
                x: panRef.current.startPanX + dx,
                y: panRef.current.startPanY + dy,
            })
        }
        const handleUp = () => {
            panRef.current = null
            window.removeEventListener('mousemove', handleMove)
            window.removeEventListener('mouseup', handleUp)
        }
        window.addEventListener('mousemove', handleMove)
        window.addEventListener('mouseup', handleUp)
    }, [pan])

    // Click on background area = close (not on image, not after drag)
    const handleImageAreaClick = useCallback((e: React.MouseEvent) => {
        if (didDragRef.current) { didDragRef.current = false; return }
        // Only close if clicking the background (the flex container itself)
        if (e.target !== e.currentTarget) return
        onClose()
    }, [onClose])

    const overlay = (
        <div
            ref={containerRef}
            className="fixed inset-0 z-[99999] bg-black/90 flex flex-col"
        >
            {/* Toolbar — clicks here do NOT close */}
            <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/80 border-b border-zinc-800 select-none">
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleFit}
                        className={`px-3 py-1 text-xs rounded transition-colors ${mode === 'fit' ? 'bg-zinc-700 text-zinc-200' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >Fit</button>
                    <button
                        onClick={handleActualSize}
                        className={`px-3 py-1 text-xs rounded transition-colors ${mode === '100' ? 'bg-zinc-700 text-zinc-200' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >100%</button>
                    <span className="text-zinc-600 text-xs ml-2">{Math.round(zoom * 100)}% · {naturalWidth}×{naturalHeight}</span>
                </div>
                <button
                    onClick={onClose}
                    className="text-zinc-500 hover:text-zinc-200 text-sm px-2 py-1 transition-colors"
                >ESC</button>
            </div>

            {/* Image area — click background to close, drag to pan, wheel to zoom */}
            <div
                ref={imageAreaRef}
                className="flex-1 overflow-hidden flex items-center justify-center cursor-grab active:cursor-grabbing"
                onMouseDown={handleMouseDown}
                onClick={handleImageAreaClick}
            >
                <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        width: naturalWidth,
                        height: naturalHeight,
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                        transformOrigin: 'center center',
                    }}
                >
                    <img
                        src={src}
                        alt=""
                        draggable={false}
                        className="select-none w-full h-full"
                        style={{
                            imageRendering: zoom >= 2 ? 'pixelated' : 'auto',
                        }}
                    />
                </div>
            </div>
        </div>
    )

    if (typeof document === 'undefined') return null
    return createPortal(overlay, document.body)
}