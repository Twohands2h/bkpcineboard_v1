'use client'

import { useState, useCallback } from 'react'
import type { EntityType } from '@/app/actions/entities'

const ENTITY_TYPES: { value: EntityType; label: string; emoji: string }[] = [
    { value: 'character', label: 'Character', emoji: '👤' },
    { value: 'environment', label: 'Environment', emoji: '🌍' },
    { value: 'prop', label: 'Props', emoji: '🎭' },
    { value: 'cinematography', label: 'Cinematography', emoji: '🎬' },
]

interface CrystallizeModalProps {
    /** Number of nodes selected (for display) */
    nodeCount: number
    onConfirm: (name: string, entityType: EntityType) => void
    onCancel: () => void
}

export function CrystallizeModal({ nodeCount, onConfirm, onCancel }: CrystallizeModalProps) {
    const [name, setName] = useState('')
    const [entityType, setEntityType] = useState<EntityType | null>(null)

    const canConfirm = name.trim().length > 0 && entityType !== null

    const handleConfirm = useCallback(() => {
        if (!canConfirm) return
        onConfirm(name.trim(), entityType!)
    }, [name, entityType, canConfirm, onConfirm])

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60" onClick={onCancel}>
            <div
                className="bg-zinc-900 border border-zinc-600 rounded-lg w-[420px] max-w-[95vw] shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-5 pt-5 pb-3">
                    <h2 className="text-sm font-semibold text-zinc-100">💎 Crystallize → Entity</h2>
                    <p className="text-[10px] text-zinc-500 mt-1">
                        {nodeCount} {nodeCount === 1 ? 'node' : 'nodes'} selected — will be replaced by entity reference
                    </p>
                </div>

                {/* Body */}
                <div className="px-5 pb-4 space-y-4">
                    {/* Entity name */}
                    <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1.5">
                            Entity Name
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && canConfirm) handleConfirm() }}
                            placeholder="e.g. Geremia, Negozio Antiquario, Camice Bianca…"
                            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                            autoFocus
                        />
                    </div>

                    {/* Entity type — required selection */}
                    <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1.5">
                            Entity Type
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {ENTITY_TYPES.map(t => (
                                <button
                                    key={t.value}
                                    onClick={() => setEntityType(t.value)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded border text-left transition-all ${
                                        entityType === t.value
                                            ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                                            : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
                                    }`}
                                >
                                    <span className="text-base">{t.emoji}</span>
                                    <span className="text-xs font-medium">{t.label}</span>
                                </button>
                            ))}
                        </div>
                        {entityType === null && (
                            <p className="text-[9px] text-zinc-600 mt-1">Select a type to continue</p>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-zinc-800">
                    <button
                        onClick={onCancel}
                        className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={!canConfirm}
                        className="px-4 py-1.5 text-xs rounded bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        Crystallize
                    </button>
                </div>
            </div>
        </div>
    )
}
