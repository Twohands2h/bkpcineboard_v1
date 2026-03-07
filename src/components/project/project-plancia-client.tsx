'use client'

import { useState } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────

export interface PlanciaProject {
    id: string
    title: string
    logline: string | null
}

interface Props {
    project: PlanciaProject
    projectId: string
}

// ── Tabs ──────────────────────────────────────────────────────────────────

type Tab = 'shotlist' | 'sceneggiatura' | 'entity' | 'media' | 'take-libero'

const TABS: { id: Tab; label: string; enabled: boolean }[] = [
    { id: 'shotlist', label: 'Shotlist', enabled: true },
    { id: 'sceneggiatura', label: 'Sceneggiatura', enabled: false },
    { id: 'entity', label: 'Entity', enabled: false },
    { id: 'media', label: 'Media / Export', enabled: false },
    { id: 'take-libero', label: 'Take Libero', enabled: false },
]

// ── Placeholder area ──────────────────────────────────────────────────────

function PlaceholderArea({ label }: { label: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-32">
            <div className="w-10 h-10 rounded-full border border-zinc-800 flex items-center justify-center mb-3">
                <span className="text-zinc-700">◌</span>
            </div>
            <p className="text-zinc-700 text-xs">{label} — coming soon</p>
        </div>
    )
}

// ── Shotlist area (P0 skeleton) ───────────────────────────────────────────

function ShotlistArea() {
    const [viewMode, setViewMode] = useState<'storyboard' | 'shotlist'>('storyboard')

    return (
        <>
            <div className="flex items-center justify-between mb-5">
                <span className="text-zinc-600 text-[10px] font-mono uppercase tracking-widest">
                    Sequence View
                </span>
                <div className="flex items-center gap-0.5 bg-zinc-800/50 border border-zinc-700/50 rounded p-0.5">
                    {(['storyboard', 'shotlist'] as const).map(mode => (
                        <button
                            key={mode}
                            onClick={() => setViewMode(mode)}
                            className={`px-3 py-1 text-xs rounded capitalize transition-colors ${viewMode === mode
                                    ? 'bg-zinc-700 text-zinc-100 font-medium'
                                    : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                        >
                            {mode}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex flex-col items-center justify-center py-24 border border-dashed border-zinc-800 rounded-lg">
                <p className="text-zinc-700 text-xs font-mono">
                    {viewMode === 'storyboard' ? 'Storyboard grid' : 'Shotlist rows'} — P1
                </p>
            </div>
        </>
    )
}

// ── Main ──────────────────────────────────────────────────────────────────

export function ProjectPlanciaClient({ project, projectId }: Props) {
    const [activeTab, setActiveTab] = useState<Tab>('shotlist')

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">

            {/* ── Cinematic hero ────────────────────────────────────────────── */}
            <header className="relative h-[320px] sm:h-[380px] md:h-[420px] overflow-hidden flex-shrink-0">

                {/* Background — placeholder gradient (swap src for real image later) */}
                <div
                    className="absolute inset-0 bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-950"
                    aria-hidden="true"
                />

                {/* Cinematic overlay: bottom-up dark gradient + edge vignette */}
                <div
                    className="absolute inset-0"
                    style={{
                        background: [
                            'linear-gradient(to top, rgba(9,9,11,0.97) 0%, rgba(9,9,11,0.6) 40%, rgba(9,9,11,0.15) 70%, transparent 100%)',
                            'radial-gradient(ellipse at center, transparent 50%, rgba(9,9,11,0.55) 100%)',
                        ].join(', '),
                    }}
                    aria-hidden="true"
                />

                {/* Foreground content — pinned to bottom-left */}
                <div className="absolute inset-x-0 bottom-0 max-w-7xl mx-auto px-6 pb-8 flex items-end gap-6">

                    {/* Poster card placeholder */}
                    <div className="hidden sm:flex w-28 shrink-0 aspect-video rounded-md bg-zinc-800/70 border border-zinc-700/40 items-center justify-center shadow-2xl">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-zinc-600">
                            <rect x="3" y="3" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
                            <path d="M3 17l5-5 4 4 3-3 6 6" stroke="currentColor" strokeWidth="1.5"
                                strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>

                    {/* Title + logline */}
                    <div className="flex-1 min-w-0">
                        <p className="text-zinc-500 text-[10px] font-mono uppercase tracking-widest mb-1">
                            Progetto
                        </p>
                        <h1 className="text-2xl sm:text-3xl font-semibold text-zinc-50 leading-tight drop-shadow-lg">
                            {project.title}
                        </h1>
                        {project.logline
                            ? <p className="text-zinc-400 text-sm mt-2 leading-relaxed line-clamp-2 max-w-2xl">
                                {project.logline}
                            </p>
                            : <p className="text-zinc-600 text-sm mt-2 italic">Nessuna logline</p>
                        }
                    </div>

                    {/* CTA — stub, disabled until P1 wires continueHref */}
                    <div className="shrink-0 pb-0.5">
                        <span className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-zinc-100/10 border border-zinc-100/20 text-zinc-400 text-xs font-medium cursor-not-allowed select-none backdrop-blur-sm">
                            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5"
                                    strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            Continua a lavorare
                        </span>
                    </div>
                </div>
            </header>

            {/* Horizontal menu */}
            <nav className="border-b border-zinc-800/60 sticky top-0 z-10 bg-zinc-950/90 backdrop-blur-sm">
                <div className="max-w-7xl mx-auto px-6 flex items-center">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => tab.enabled && setActiveTab(tab.id)}
                            disabled={!tab.enabled}
                            className={`px-4 py-3 text-xs font-medium border-b-2 -mb-px transition-colors ${activeTab === tab.id
                                    ? 'text-zinc-100 border-zinc-400'
                                    : tab.enabled
                                        ? 'text-zinc-500 border-transparent hover:text-zinc-300'
                                        : 'text-zinc-700 border-transparent cursor-not-allowed'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </nav>

            {/* Central adaptive area */}
            <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-6">
                {activeTab === 'shotlist' && <ShotlistArea />}
                {activeTab === 'sceneggiatura' && <PlaceholderArea label="Sceneggiatura" />}
                {activeTab === 'entity' && <PlaceholderArea label="Entity Library" />}
                {activeTab === 'media' && <PlaceholderArea label="Media / Export" />}
                {activeTab === 'take-libero' && <PlaceholderArea label="Take Libero" />}
            </main>
        </div>
    )
}