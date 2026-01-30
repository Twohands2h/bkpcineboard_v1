'use client'

// ============================================
// NODE PALETTE — Phase 2K
// ============================================

// ============================================
// TYPES
// ============================================

interface NodePaletteItem {
  variant: string
  archetype: 'content' | 'structural' | 'reference'
  icon: string
  label: string
  description: string
}

// ============================================
// PALETTE ITEMS
// ============================================

const CONTENT_NODES: NodePaletteItem[] = [
  { variant: 'note', archetype: 'content', icon: '📝', label: 'Note', description: 'Text, ideas, notes' },
  { variant: 'prompt', archetype: 'content', icon: '✨', label: 'Prompt', description: 'AI prompt with ...' },
  { variant: 'image', archetype: 'content', icon: '🖼', label: 'Image', description: 'Image or gallery' },
]

// Phase 2K: Entity Reference Nodes
// Note: These use archetype='reference' and variant matches entity type for drop detection
// The actual node content will use variant='entity' with entity_type field
const ENTITY_NODES: NodePaletteItem[] = [
  { variant: 'character', archetype: 'reference', icon: '👤', label: 'Character', description: 'Reference a cha...' },
  { variant: 'environment', archetype: 'reference', icon: '🌍', label: 'Environment', description: 'Reference a loc...' },
  { variant: 'asset', archetype: 'reference', icon: '📦', label: 'Asset', description: 'Reference an ob...' },
]

const STRUCTURAL_NODES: NodePaletteItem[] = [
  { variant: 'group', archetype: 'structural', icon: '▢', label: 'Group', description: 'Organize nodes' },
]

// ============================================
// PALETTE SECTION
// ============================================

function PaletteSection({ 
  title, 
  items 
}: { 
  title: string
  items: NodePaletteItem[] 
}) {
  const handleDragStart = (
    e: React.DragEvent,
    item: NodePaletteItem
  ) => {
    e.dataTransfer.setData('application/cineboard-archetype', item.archetype)
    e.dataTransfer.setData('application/cineboard-variant', item.variant)
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div className="mb-6">
      <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3 px-2">
        {title}
      </h3>
      <div className="space-y-1">
        {items.map((item) => (
          <div
            key={item.variant}
            draggable
            onDragStart={(e) => handleDragStart(e, item)}
            className="
              flex items-center gap-3 px-3 py-2.5
              bg-white border border-gray-200 rounded-lg
              cursor-grab active:cursor-grabbing
              hover:border-gray-300 hover:shadow-sm
              transition-all duration-150
              select-none
            "
          >
            <span className="text-lg">{item.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700">{item.label}</p>
              <p className="text-xs text-gray-400 truncate">{item.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================
// NODE PALETTE
// ============================================

interface NodePaletteProps {
  boardId: string
}

export function NodePalette({ boardId }: NodePaletteProps) {
  return (
    <aside className="w-48 bg-gray-50 border-r border-gray-200 p-4 overflow-y-auto flex-shrink-0">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">Add Node</h2>
      <p className="text-xs text-gray-500 mb-4">Drag to canvas</p>
      
      {/* Content Nodes */}
      <PaletteSection title="Content" items={CONTENT_NODES} />
      
      {/* Entity Reference Nodes - Phase 2K */}
      <PaletteSection title="Entities" items={ENTITY_NODES} />
      
      {/* Structural Nodes */}
      <PaletteSection title="Structure" items={STRUCTURAL_NODES} />
    </aside>
  )
}
