'use client'

// ===================================================
// RESTORE CONFIRM MODAL (R3.6)
// ===================================================

interface RestoreConfirmModalProps {
  onConfirm: () => void
  onCancel: () => void
}

export function RestoreConfirmModal({ onConfirm, onCancel }: RestoreConfirmModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 max-w-md w-full mx-4">
        {/* Header */}
        <h2 className="text-lg font-medium text-zinc-100 mb-3">
          Ripristinare questo Snapshot?
        </h2>

        {/* Body */}
        <div className="space-y-2 mb-6">
          <p className="text-sm text-zinc-400">
            Verrà creato un <strong className="text-zinc-200">nuovo Take</strong>.
          </p>
          <p className="text-sm text-zinc-400">
            Il Take attuale <strong className="text-zinc-200">NON sarà modificato</strong>.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Annulla
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
          >
            Crea nuovo Take
          </button>
        </div>
      </div>
    </div>
  )
}
