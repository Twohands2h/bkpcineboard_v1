// ── Entity shared types and constants ──
// No 'use server' — safe to import from both client and server components.

/** Allowed origin labels for per-media provenance.
 *  Custom strings are allowed — this list is the preset set for dropdowns. */
export const MEDIA_ORIGIN_LABELS = [
    'Production Live',
    'Take',
    'Library import',
    'External',
    'Scan',
    'Client',
    'Unknown',
] as const

export type MediaOriginLabel = typeof MEDIA_ORIGIN_LABELS[number] | string

/** Per-media provenance — stored inline in each media item. Backward-compatible:
 *  if absent on existing items, treat origin_label as "Unknown". */
export interface MediaProvenance {
    origin_label: MediaOriginLabel   // default: "Unknown"
    generated_at?: string | null     // ISO string or null
    source_prompt_id?: string | null // future-safe, null for now
    notes?: string | null            // single-line free text
}

export interface EntityContent {
    description?: string
    media?: Array<{
        storage_path: string
        bucket: string
        display_name: string
        mime_type?: string
        asset_type: 'image' | 'video'
        // Per-media provenance (v2 — backward-compatible, absent = Unknown)
        provenance?: MediaProvenance
    }>
    prompts?: Array<{
        body: string
        promptType?: string
        origin?: string
        title?: string
    }>
    notes?: Array<{ body: string }>
    provenance?: {
        generated_with?: string
        tool_origin?: string
        source_url?: string
    }
    thumbnail_path?: string
}

export type EntityType = 'character' | 'environment' | 'prop' | 'cinematography'

export interface Entity {
    id: string
    project_id: string
    name: string
    entity_type: EntityType
    content: EntityContent
    created_at: string
    updated_at: string
}

/** Shape returned by getEntitiesByIdsAction — carries full content for ENTITY.txt generation. */
export type EntityFreshData = {
    name: string
    type: string
    thumbnailPath: string | null
    content: {
        prompts: Array<{ id: string; title?: string; body: string; origin?: string }>
        notes: Array<{ id: string; body: string }>
        /** Full media list with per-media provenance — for ENTITY.txt MEDIA INCLUDED */
        media: Array<{ filename: string; generated_with: string; origin_label: string; notes: string }>
        /** origin_label values — used for deriveOriginSummary in PLP */
        mediaOriginLabels: string[]
        provenance: {
            generated_with: string   // '' if absent
            tool_origin: string      // '' if absent
        }
    }
}