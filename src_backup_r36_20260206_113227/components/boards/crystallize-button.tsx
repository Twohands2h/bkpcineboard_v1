'use client'

// ============================================
// TYPES
// ============================================

interface CrystallizeButtonProps {
  selectedCount: number
  onClick: () => void
}

// ============================================
// CRYSTALLIZE BUTTON
// ============================================

/**
 * Floating button che appare quando ≥1 nodo è selezionato.
 * Posizionato bottom-right come azione primaria temporanea.
 */
export function CrystallizeButton({ selectedCount, onClick }: CrystallizeButtonProps) {
  if (selectedCount === 0) return null

  return (
    <button
      onClick={onClick}
      className="
        flex items-center gap-2
        px-4 py-2.5
        bg-gradient-to-r from-indigo-600 to-purple-600
        text-white text-sm font-medium
        rounded-full
        shadow-lg shadow-indigo-500/30
        hover:shadow-xl hover:shadow-indigo-500/40
        hover:scale-105
        active:scale-100
        transition-all duration-200
      "
    >
      <span>✨</span>
      <span>Crystallize</span>
      <span className="px-1.5 py-0.5 bg-white/20 rounded-full text-xs">
        {selectedCount}
      </span>
    </button>
  )
}
