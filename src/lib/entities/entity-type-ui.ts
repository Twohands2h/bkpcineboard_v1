// src/lib/entities/entity-type-ui.ts
// ─────────────────────────────────────────────────────────────────────────────
// Canonical entity type UI mapping — single source of truth.
// Used by: NodeContent (EntityRefContent), Inspector badge, Entity Library.
// UI-only — no DB/snapshot changes.
// ─────────────────────────────────────────────────────────────────────────────

import { User, MapPin, Box, Clapperboard, type LucideIcon } from 'lucide-react'
import type { EntityType } from '@/app/actions/entities'

export interface EntityTypeUIConfig {
    label: string
    /** Full badge class string: text + bg + border — for pill/badge usage */
    badgeClass: string
    /** Solid stripe bg color — for left stripe on canvas node */
    stripeClass: string
    /** Text/icon color — for standalone icon tinting */
    textClass: string
    /** Lucide icon component */
    Icon: LucideIcon
}

export const ENTITY_TYPE_UI: Record<EntityType, EntityTypeUIConfig> = {
    character: {
        label:       'Character',
        badgeClass:  'text-amber-400 bg-amber-500/10 border-amber-500/20',
        stripeClass: 'bg-amber-500',
        textClass:   'text-amber-400',
        Icon:        User,
    },
    environment: {
        label:       'Environment',
        badgeClass:  'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
        stripeClass: 'bg-emerald-500',
        textClass:   'text-emerald-400',
        Icon:        MapPin,
    },
    prop: {
        label:       'Prop',
        badgeClass:  'text-blue-400 bg-blue-500/10 border-blue-500/20',
        stripeClass: 'bg-blue-500',
        textClass:   'text-blue-400',
        Icon:        Box,
    },
    cinematography: {
        label:       'Cinematography',
        badgeClass:  'text-purple-400 bg-purple-500/10 border-purple-500/20',
        stripeClass: 'bg-purple-500',
        textClass:   'text-purple-400',
        Icon:        Clapperboard,
    },
}

const FALLBACK_UI: EntityTypeUIConfig = {
    label:       'Entity',
    badgeClass:  'text-zinc-400 bg-zinc-800 border-zinc-700',
    stripeClass: 'bg-zinc-500',
    textClass:   'text-zinc-400',
    Icon:        Box,
}

/** Safe getter — returns fallback for unknown/null types */
export function getEntityTypeUI(entityType: string | null | undefined): EntityTypeUIConfig {
    if (entityType && entityType in ENTITY_TYPE_UI) {
        return ENTITY_TYPE_UI[entityType as EntityType]
    }
    return FALLBACK_UI
}
