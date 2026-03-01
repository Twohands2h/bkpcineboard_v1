// ── Provenance option lists ──
// Shared between Inspector panel and Prompt Node.
// Single source of truth — no divergence.

export const IMAGE_GENERATED_WITH_OPTIONS = [
    'Midjourney',
    'Stable Diffusion',
    'DALL·E',
    'Flux',
    'Freepik',
    'ComfyUI',
    'Nanobanana',
    'Imported / Real Footage',
] as const

export const VIDEO_GENERATED_WITH_OPTIONS = [
    'Runway',
    'Kling',
    'Pika',
    'Luma',
    'Sora',
    'Veo 3',
    'Higgsfield',
    'Weavy',
    'Freepik',
    'ComfyUI',
    'Nanobanana',
    'Imported / Real Footage',
] as const

export const PROMPT_TOOL_ORIGIN_OPTIONS = [
    'ChatGPT',
    'Claude',
    'Gemini',
    'Midjourney',
    'Runway',
    'Kling',
    'Veo',
    'ComfyUI',
    'Manual',
] as const

// ── Normalization helpers ──
// Alias map: lowercase → canonical label.
// Built once from all option lists + common aliases.

const ALIAS_MAP: Record<string, string> = (() => {
    const map: Record<string, string> = {}
    const allOptions = [
        ...IMAGE_GENERATED_WITH_OPTIONS,
        ...VIDEO_GENERATED_WITH_OPTIONS,
        ...PROMPT_TOOL_ORIGIN_OPTIONS,
    ]
    for (const opt of allOptions) {
        map[opt.toLowerCase()] = opt
    }
    // Extra aliases for common variants
    map['dalle'] = 'DALL·E'
    map['dall-e'] = 'DALL·E'
    map['dall·e'] = 'DALL·E'
    map['sd'] = 'Stable Diffusion'
    map['stablediffusion'] = 'Stable Diffusion'
    map['mj'] = 'Midjourney'
    map['mid journey'] = 'Midjourney'
    map['gpt'] = 'ChatGPT'
    map['chatgpt'] = 'ChatGPT'
    map['openai'] = 'ChatGPT'
    map['imported'] = 'Imported / Real Footage'
    map['real footage'] = 'Imported / Real Footage'
    map['real'] = 'Imported / Real Footage'
    map['veo'] = 'Veo'
    map['veo 3'] = 'Veo 3'
    return map
})()

/**
 * Normalize a provenance value: trim, then resolve via case-insensitive alias map.
 * Returns the canonical label if found, otherwise the trimmed input.
 */
export function normalizeProvenanceValue(value: string): string {
    const trimmed = value.trim()
    if (!trimmed) return ''
    return ALIAS_MAP[trimmed.toLowerCase()] ?? trimmed
}

/**
 * Check if a value matches a standard option (after normalization).
 */
export function isStandardProvenance(value: string, options: readonly string[]): boolean {
    if (!value) return false
    const normalized = normalizeProvenanceValue(value)
    return options.includes(normalized as any)
}