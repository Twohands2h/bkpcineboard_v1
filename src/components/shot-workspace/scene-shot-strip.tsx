'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

// ===================================================
// SCENE + SHOT STRIP — V1 (placeholder thumbnails)
// ===================================================

export interface StripScene {
    id: string
    title: string
    order_index: number
    firstShotId: string | null
}

export interface StripShot {
    id: string
    order_index: number
    visual_description: string
    thumbSrc?: string | null
    status: 'DECIDED' | 'HAS_FV' | 'DEFAULT'
}

interface SceneShotStripProps {
    projectId: string
    scenes: StripScene[]
    currentSceneId: string
    currentShotId: string
    sceneShots: StripShot[]
    activeShotOverrideHasFV?: boolean
}

// Session-only memory helpers (no DB, no domain changes)
function getLastShotForScene(sceneId: string): string | null {
    try { return sessionStorage.getItem(`cb:lastShot:${sceneId}`) } catch { return null }
}
function setLastShotForScene(sceneId: string, shotId: string) {
    try { sessionStorage.setItem(`cb:lastShot:${sceneId}`, shotId) } catch { }
}
function getLastTakeForShot(shotId: string): string | null {
    try { return sessionStorage.getItem(`cb:lastTake:${shotId}`) } catch { return null }
}
export function setLastTakeForShot(shotId: string, takeId: string) {
    try { sessionStorage.setItem(`cb:lastTake:${shotId}`, takeId) } catch { }
}

export function SceneShotStrip({
    projectId,
    scenes,
    currentSceneId,
    currentShotId,
    sceneShots,
    activeShotOverrideHasFV,
}: SceneShotStripProps) {
    const router = useRouter()

    // Record current shot as last-visited for this scene
    useEffect(() => {
        setLastShotForScene(currentSceneId, currentShotId)
    }, [currentSceneId, currentShotId])

    const navigateToShot = (shotId: string) => {
        if (shotId === currentShotId) return
        const takeId = getLastTakeForShot(shotId)
        const url = takeId
            ? `/projects/${projectId}/shots/${shotId}?take=${takeId}`
            : `/projects/${projectId}/shots/${shotId}`
        router.push(url)
    }

    const navigateToScene = (scene: StripScene) => {
        if (scene.id === currentSceneId) return
        const lastShot = getLastShotForScene(scene.id) ?? scene.firstShotId
        if (!lastShot) return
        const takeId = getLastTakeForShot(lastShot)
        const url = takeId
            ? `/projects/${projectId}/shots/${lastShot}?take=${takeId}`
            : `/projects/${projectId}/shots/${lastShot}`
        router.push(url)
    }

    return (
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 py-1 flex items-center gap-3 shrink-0 select-none" style={{ height: 48 }}>
            {/* Scene pills */}
            <div className="flex items-center gap-1 shrink-0">
                {scenes.map((scene) => (
                    <button
                        key={scene.id}
                        onClick={() => navigateToScene(scene)}
                        className={`px-2.5 py-1 text-[10px] font-medium rounded transition-colors whitespace-nowrap ${scene.id === currentSceneId
                                ? 'bg-zinc-700 text-zinc-100'
                                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                            }`}
                    >
                        {scene.title || `Scene ${scene.order_index + 1}`}
                    </button>
                ))}
            </div>

            {/* Separator */}
            <div className="w-px h-6 bg-zinc-700 shrink-0" />

            {/* Shot cells */}
            <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0">
                {sceneShots.map((shot) => {
                    const isActive = shot.id === currentShotId
                    // For active shot, client state overrides server status
                    const effectiveStatus = isActive && activeShotOverrideHasFV !== undefined
                        ? (shot.status === 'DECIDED' ? 'DECIDED' : (activeShotOverrideHasFV ? 'HAS_FV' : 'DEFAULT'))
                        : shot.status
                    const shotUrl = `/projects/${projectId}/shots/${shot.id}`

                    return (
                        <button
                            key={shot.id}
                            onClick={() => navigateToShot(shot.id)}
                            onMouseEnter={() => router.prefetch(shotUrl)}
                            className={`shrink-0 flex items-center gap-1.5 px-1.5 py-0.5 rounded transition-colors relative ${isActive
                                    ? 'bg-zinc-700/80 ring-1 ring-blue-500/60'
                                    : 'hover:bg-zinc-800'
                                }`}
                        >
                            {/* Thumbnail or placeholder */}
                            {shot.thumbSrc ? (
                                <div className="w-7 h-5 bg-zinc-800 overflow-hidden border border-emerald-700/40 rounded-sm flex-shrink-0">
                                    <img
                                        src={shot.thumbSrc}
                                        alt=""
                                        width={28}
                                        height={20}
                                        loading="lazy"
                                        decoding="async"
                                        className="w-full h-full object-cover"
                                        draggable={false}
                                    />
                                </div>
                            ) : (
                                <div className="w-7 h-5 rounded-sm border border-zinc-700 bg-zinc-850 flex items-center justify-center flex-shrink-0">
                                    <span className="text-zinc-600 text-[7px]">#</span>
                                </div>
                            )}

                            {/* Label + status dot */}
                            <span className={`text-[10px] font-mono ${isActive ? 'text-zinc-200' : 'text-zinc-500'
                                }`}>
                                {shot.order_index + 1}
                            </span>

                            {/* Silent status indicator */}
                            {effectiveStatus !== 'DEFAULT' && (
                                <div
                                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${effectiveStatus === 'DECIDED'
                                            ? 'bg-emerald-500'
                                            : 'bg-amber-500/70'
                                        }`}
                                    title={effectiveStatus === 'DECIDED' ? 'Approved' : 'Has Final Visual'}
                                />
                            )}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}