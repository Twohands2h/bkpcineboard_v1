/**
 * Shared entity cache + reactive version counter.
 * Any component can invalidate + bump; all consumers re-render.
 *
 * Usage:
 *   import { entityCache, invalidateEntityCache, bumpEntityVersion, useEntityVersion } from '@/lib/entities/entity-cache'
 */

import { useSyncExternalStore } from 'react'
import type { Entity } from '@/app/actions/entities'

// ── Cache ──

export const entityCache = new Map<string, Entity>()

export function invalidateEntityCache(entityId: string) {
    entityCache.delete(entityId)
}

export function invalidateAllEntityCache() {
    entityCache.clear()
}

// ── Reactive version counter ──

let entityVersion = 0
const listeners = new Set<() => void>()

export function bumpEntityVersion() {
    entityVersion++
    listeners.forEach(cb => cb())
}

function subscribe(cb: () => void) {
    listeners.add(cb)
    return () => { listeners.delete(cb) }
}

function getSnapshot() {
    return entityVersion
}

/** React hook — triggers re-render when any component calls bumpEntityVersion() */
export function useEntityVersion(): number {
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
