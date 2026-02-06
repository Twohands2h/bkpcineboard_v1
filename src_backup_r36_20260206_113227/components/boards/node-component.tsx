'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { NodeResizer, type NodeProps } from 'reactflow'
import { CanonicalBadge } from '@/components/boards/canonical-badge'
import { PromoteActions } from '@/components/boards/promote-actions'
import type { WorkspaceInfo } from '@/components/boards/board-canvas'

// ============================================
// CONSTANTS — Visual Foundation
// ============================================

const COLLAPSED_HEIGHT = 44 // Solo header visibile
const DEFAULT_HEIGHT = 140

// Phase 2K: EntityRef fixed dimensions - small square
const ENTITY_REF_SIZE = 64 // Small square

// ============================================
// TYPES
// ============================================

interface NodeContentUI {
  color?: string
  collapsed?: boolean
}

interface BaseNodeContent {
  variant?: string
  title?: string
  ui?: NodeContentUI
}

interface NoteContent extends BaseNodeContent {
  variant: 'note'
  body?: string
}

interface PromptContent extends BaseNodeContent {
  variant: 'prompt'
  body?: string
  platform?: string
  model?: string
}

interface ImageItem {
  url: string
  source?: string
  caption?: string
}

interface ImageContent extends BaseNodeContent {
  variant: 'image'
  items?: ImageItem[]
}

// Phase 2K: Extended EntityRef content
interface EntityRefContent extends BaseNodeContent {
  variant: 'entity'
  ref_type: 'entity'
  ref_id: string
  entity_type?: 'character' | 'environment' | 'asset'
  display_title?: string
  display_image?: string | null
  isArchived?: boolean // Entity è stata archiviata
}

interface GroupContent extends BaseNodeContent {
  variant: 'group'
}

type NodeContent = NoteContent | PromptContent | ImageContent | EntityRefContent | GroupContent | BaseNodeContent

interface NodeData {
  id: string
  archetype: string
  content: NodeContent
  onUpdate: (nodeId: string, updates: { 
    content?: Partial<NodeContent>
    size?: { width: number; height: number } 
  }) => void
  onDelete: (nodeId: string) => void
  onCopy: (nodeId: string) => void
  onNavigate?: (refType: string, refId: string) => void
  workspaceInfo?: WorkspaceInfo
}

// ============================================
// VARIANT CONFIG — Minimal, cinematografico
// ============================================

const VARIANT_CONFIG: Record<string, { icon: string; label: string; headerBg: string }> = {
  note: { icon: '📝', label: 'Note', headerBg: 'bg-gray-50' },
  prompt: { icon: '✨', label: 'Prompt', headerBg: 'bg-amber-50' },
  image: { icon: '🖼', label: 'Image', headerBg: 'bg-blue-50' },
  entity: { icon: '🔗', label: 'Entity', headerBg: 'bg-indigo-50' },
  group: { icon: '▢', label: 'Group', headerBg: 'bg-gray-50' },
  default: { icon: '▤', label: 'Node', headerBg: 'bg-gray-50' }
}

// Phase 2K: Entity type visual config
const ENTITY_TYPE_CONFIG: Record<string, { icon: string; borderColor: string; bgColor: string; textColor: string }> = {
  character: { 
    icon: '👤', 
    borderColor: 'border-indigo-300', 
    bgColor: 'bg-indigo-50',
    textColor: 'text-indigo-700'
  },
  environment: { 
    icon: '🌍', 
    borderColor: 'border-emerald-300', 
    bgColor: 'bg-emerald-50',
    textColor: 'text-emerald-700'
  },
  asset: { 
    icon: '📦', 
    borderColor: 'border-amber-300', 
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-700'
  },
  default: { 
    icon: '🔗', 
    borderColor: 'border-gray-300', 
    bgColor: 'bg-gray-50',
    textColor: 'text-gray-700'
  }
}

// ============================================
// VARIANT BODY RENDERERS
// ============================================

function NoteBody({ content, isEditing, onBodyChange }: { 
  content: NoteContent
  isEditing: boolean
  onBodyChange: (body: string) => void 
}) {
  const [body, setBody] = useState(content.body || '')
  
  useEffect(() => {
    setBody(content.body || '')
  }, [content.body])

  if (isEditing) {
    return (
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onBlur={() => onBodyChange(body)}
        className="w-full h-full text-sm text-gray-600 bg-transparent resize-none outline-none leading-relaxed"
        placeholder="Write your note..."
        autoFocus
      />
    )
  }

  return (
    <p className="text-sm text-gray-600 whitespace-pre-wrap line-clamp-4 leading-relaxed">
      {content.body || <span className="text-gray-400 italic">Empty note</span>}
    </p>
  )
}

function PromptBody({ content, isEditing, onBodyChange }: { 
  content: PromptContent
  isEditing: boolean
  onBodyChange: (body: string) => void 
}) {
  const [body, setBody] = useState(content.body || '')
  
  useEffect(() => {
    setBody(content.body || '')
  }, [content.body])

  return (
    <div className="space-y-2 h-full flex flex-col">
      {isEditing ? (
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onBlur={() => onBodyChange(body)}
          className="flex-1 text-sm text-gray-600 bg-transparent resize-none outline-none font-mono leading-relaxed"
          placeholder="Write your prompt..."
          autoFocus
        />
      ) : (
        <p className="text-sm text-gray-600 whitespace-pre-wrap line-clamp-3 font-mono flex-1 leading-relaxed">
          {content.body || <span className="text-gray-400 italic">Empty prompt</span>}
        </p>
      )}
      {(content.platform || content.model) && (
        <div className="flex gap-2 text-xs flex-shrink-0">
          {content.platform && (
            <span className="px-2 py-0.5 bg-amber-100/80 text-amber-700 rounded-full text-xs">
              {content.platform}
            </span>
          )}
          {content.model && (
            <span className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full text-xs">
              {content.model}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function ImageBody({ content }: { content: ImageContent }) {
  const firstItem = content.items?.[0]
  
  if (!firstItem?.url) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm italic">
        No image
      </div>
    )
  }

  return (
    <div className="relative w-full h-full">
      <img
        src={firstItem.url}
        alt={firstItem.caption || content.title || 'Image'}
        className="w-full h-full object-cover rounded"
      />
      {firstItem.source && (
        <span className="absolute bottom-1 right-1 px-2 py-0.5 bg-black/60 text-white text-xs rounded-full">
          {firstItem.source}
        </span>
      )}
    </div>
  )
}

function GroupBody() {
  return (
    <div className="flex items-center justify-center h-full border-2 border-dashed border-gray-200 rounded-lg text-gray-300 text-xs">
      Group
    </div>
  )
}

// ============================================
// Phase 2K: ENTITY REFERENCE NODE COMPONENT
// Square with rounded corners, fixed size, icon + name
// ============================================

function EntityRefNode({ 
  data, 
  selected 
}: { 
  data: NodeData
  selected: boolean 
}) {
  const { id, content, onDelete, onCopy, onNavigate } = data
  const entityContent = content as EntityRefContent
  const [isHovered, setIsHovered] = useState(false)
  
  const entityType = entityContent.entity_type || 'default'
  const isArchived = entityContent.isArchived === true
  
  // Use gray config for archived entities
  const config = isArchived 
    ? { icon: '📦', borderColor: 'border-gray-300', bgColor: 'bg-gray-100', textColor: 'text-gray-500' }
    : (ENTITY_TYPE_CONFIG[entityType] || ENTITY_TYPE_CONFIG.default)
  
  const showMenu = isHovered || selected

  const handleClick = () => {
    // Navigate to entity detail (opens Entity Library drawer)
    // Works for both active and archived entities
    if (onNavigate && entityContent.ref_id) {
      onNavigate('entity', entityContent.ref_id)
    }
  }

  return (
    <div
      className={`
        w-full h-full
        ${config.bgColor}
        rounded-2xl
        flex flex-col items-center justify-center
        gap-1
        cursor-pointer
        transition-all duration-150
        ${isArchived ? 'opacity-60' : ''}
        ${selected 
          ? 'shadow-lg ring-2 ring-blue-400/50' 
          : isHovered 
            ? 'shadow-md' 
            : 'shadow-sm'
        }
        border-2 ${selected ? 'border-blue-400' : config.borderColor}
        ${isArchived ? 'border-dashed' : ''}
        relative
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
    >
      {/* Archived Badge — top left */}
      {isArchived && (
        <div className="absolute -top-2 -left-2 px-1.5 py-0.5 bg-gray-500 text-white text-[9px] font-medium rounded-full">
          Archived
        </div>
      )}
      
      {/* Entity Type Icon - Large, centered */}
      <span className={`text-3xl ${isArchived ? 'grayscale' : ''}`}>
        {ENTITY_TYPE_CONFIG[entityType]?.icon || config.icon}
      </span>
      
      {/* Entity Name - Below icon, truncated */}
      <span className={`text-xs font-medium ${config.textColor} truncate max-w-[90%] text-center px-1`}>
        {entityContent.display_title || 'Unnamed'}
      </span>
      
      {/* Actions — floating top-right, visible on hover */}
      <div 
        className={`
          absolute -top-2 -right-2
          flex items-center gap-0.5
          transition-opacity duration-100
          ${showMenu ? 'opacity-100' : 'opacity-0'}
        `}
      >
        <button
          onClick={(e) => {
            e.stopPropagation()
            onCopy(id)
          }}
          className="w-6 h-6 bg-white border border-gray-200 rounded-full shadow-sm flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
          title="Copy"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete(id)
          }}
          className="w-6 h-6 bg-white border border-gray-200 rounded-full shadow-sm flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"
          title="Delete"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ============================================
// NODE COMPONENT — Visual Foundation
// ============================================

export function NodeComponent({ data, selected }: NodeProps<NodeData>) {
  const { id, archetype, content, onUpdate, onDelete, onCopy, onNavigate, workspaceInfo } = data
  
  const variant = (content as BaseNodeContent)?.variant || 'default'
  
  // ============================================
  // Phase 2K: Early return for EntityRef nodes
  // Completely different rendering
  // ============================================
  
  if (variant === 'entity') {
    return <EntityRefNode data={data} selected={selected} />
  }
  
  // ============================================
  // STATE (for Content/Structural nodes only)
  // ============================================
  
  const [isHovered, setIsHovered] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [isEditingBody, setIsEditingBody] = useState(false)
  const [showPromoteMenu, setShowPromoteMenu] = useState(false)
  const [title, setTitle] = useState(content?.title || '')
  const inputRef = useRef<HTMLInputElement>(null)
  const promoteMenuRef = useRef<HTMLDivElement>(null)

  const config = VARIANT_CONFIG[variant] || VARIANT_CONFIG.default

  const ui = content?.ui || {}
  const color = ui.color || null
  const collapsed = ui.collapsed || false

  // ============================================
  // EFFECTS
  // ============================================

  useEffect(() => {
    setTitle(content?.title || '')
  }, [content?.title])

  useEffect(() => {
    if (isEditingTitle && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditingTitle])

  // Close promote menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (promoteMenuRef.current && !promoteMenuRef.current.contains(event.target as Node)) {
        setShowPromoteMenu(false)
      }
    }

    if (showPromoteMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showPromoteMenu])

  // ============================================
  // HANDLERS
  // ============================================

  const handleSaveTitle = useCallback(() => {
    setIsEditingTitle(false)
    if (title !== content?.title) {
      onUpdate(id, { content: { title } })
    }
  }, [id, title, content?.title, onUpdate])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveTitle()
    } else if (e.key === 'Escape') {
      setTitle(content?.title || '')
      setIsEditingTitle(false)
    }
  }, [handleSaveTitle, content?.title])

  const handleBodyChange = useCallback((body: string) => {
    setIsEditingBody(false)
    onUpdate(id, { content: { body } })
  }, [id, onUpdate])

  const handleToggleCollapse = useCallback(() => {
    const newCollapsed = !collapsed
    
    onUpdate(id, { 
      content: { ui: { collapsed: newCollapsed } },
      size: { 
        width: 220,
        height: newCollapsed ? COLLAPSED_HEIGHT : DEFAULT_HEIGHT 
      }
    })
  }, [id, collapsed, onUpdate])

  const handleResize = useCallback((_: unknown, params: { width: number; height: number }) => {
    onUpdate(id, { 
      size: { width: params.width, height: params.height } 
    })
  }, [id, onUpdate])

  const handlePromoteSuccess = useCallback(() => {
    setShowPromoteMenu(false)
  }, [])

  // ============================================
  // RENDER BODY
  // ============================================

  const renderBody = () => {
    if (collapsed) return null

    switch (variant) {
      case 'note':
        return (
          <div 
            className="flex-1 p-3 min-h-0 overflow-hidden cursor-text"
            onDoubleClick={() => setIsEditingBody(true)}
          >
            <NoteBody 
              content={content as NoteContent} 
              isEditing={isEditingBody}
              onBodyChange={handleBodyChange}
            />
          </div>
        )
      case 'prompt':
        return (
          <div 
            className="flex-1 p-3 min-h-0 overflow-hidden cursor-text"
            onDoubleClick={() => setIsEditingBody(true)}
          >
            <PromptBody 
              content={content as PromptContent} 
              isEditing={isEditingBody}
              onBodyChange={handleBodyChange}
            />
          </div>
        )
      case 'image':
        return (
          <div className="flex-1 p-2 min-h-0 overflow-hidden">
            <ImageBody content={content as ImageContent} />
          </div>
        )
      case 'group':
        return (
          <div className="flex-1 p-2 min-h-0">
            <GroupBody />
          </div>
        )
      default:
        return (
          <div className="flex-1 p-3 min-h-0">
            <p className="text-xs text-gray-400 italic">{archetype}</p>
          </div>
        )
    }
  }

  // ============================================
  // Menu visibile su hover O selected (Manifesto: Hover > Click)
  // ============================================
  
  const showMenu = (isHovered || selected) && !isEditingTitle

  // ============================================
  // RENDER (Content/Structural nodes)
  // ============================================

  return (
    <>
      {/* Resizer — solo quando selected */}
      <NodeResizer
        isVisible={selected && !collapsed}
        minWidth={180}
        minHeight={collapsed ? COLLAPSED_HEIGHT : 80}
        onResizeEnd={handleResize}
        lineClassName="border-blue-400"
        handleClassName="w-2 h-2 bg-blue-500 border border-white rounded-sm"
      />

      {/* ============================================ */}
      {/* FLOATING OVERLAY LAYER — Badge e Promote    */}
      {/* Fuori dal nodo, stesso layer di resize      */}
      {/* ============================================ */}
      
      {/* Canonical Badge — FLOATING in alto a destra, FUORI dal nodo */}
      <div className="absolute -top-3 -right-3 z-30">
        <CanonicalBadge 
          nodeVariant={variant}
          nodeContent={{
            body: (content as NoteContent | PromptContent)?.body,
            items: (content as ImageContent)?.items
          }}
          workspaceInfo={workspaceInfo}
        />
      </div>

      {/* Promote Button — FLOATING in alto, FUORI dal nodo, visibile su hover */}
      {showMenu && workspaceInfo?.isWorkspace && (
        <div 
          ref={promoteMenuRef}
          className="absolute -top-3 left-1/2 -translate-x-1/2 z-30"
        >
          <button
            onClick={() => setShowPromoteMenu(!showPromoteMenu)}
            className="w-6 h-6 bg-white border border-gray-200 rounded-full shadow-sm flex items-center justify-center text-gray-400 hover:text-amber-600 hover:border-amber-300 hover:bg-amber-50 transition-colors"
            title="Promote to canonical"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </button>
          
          {/* Promote Dropdown Menu */}
          {showPromoteMenu && (
            <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
              <PromoteActions
                nodeVariant={variant}
                nodeContent={{
                  body: (content as NoteContent | PromptContent)?.body,
                  items: (content as ImageContent)?.items
                }}
                workspaceInfo={workspaceInfo}
                onSuccess={handlePromoteSuccess}
              />
            </div>
          )}
        </div>
      )}

      {/* ============================================ */}
      {/* NODE FRAME — oggetto fisico che appoggia    */}
      {/* ============================================ */}
      
      <div
        className={`
          w-full h-full
          bg-white
          rounded-xl
          flex flex-col
          overflow-hidden
          transition-shadow duration-150
          ${selected 
            ? 'shadow-lg ring-2 ring-blue-400/50' 
            : isHovered 
              ? 'shadow-md' 
              : 'shadow-sm'
          }
        `}
        style={{
          border: `1.5px solid ${selected ? '#3b82f6' : (color || '#e5e7eb')}`
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Header */}
        <div 
          className={`
            flex items-center gap-2 px-3 py-2 
            border-b border-gray-100
            flex-shrink-0
            ${config.headerBg}
          `}
        >
          {/* Icon */}
          <span className="text-sm select-none flex-shrink-0">{config.icon}</span>

          {/* Title */}
          {isEditingTitle ? (
            <input
              ref={inputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={handleKeyDown}
              className="flex-1 text-sm font-medium bg-white border border-blue-300 rounded px-2 py-0.5 outline-none min-w-0"
              placeholder="Untitled"
            />
          ) : (
            <span
              className="flex-1 text-sm font-medium text-gray-700 truncate cursor-text min-w-0"
              onDoubleClick={() => setIsEditingTitle(true)}
              title={title || 'Double-click to edit'}
            >
              {title || <span className="text-gray-400">Untitled</span>}
            </span>
          )}

          {/* Actions — visibili su hover (Manifesto: Hover > Click) */}
          <div 
            className={`
              flex items-center gap-0.5 flex-shrink-0
              transition-opacity duration-100
              ${showMenu ? 'opacity-100' : 'opacity-0'}
            `}
          >
            <button
              onClick={handleToggleCollapse}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
              title={collapsed ? 'Expand' : 'Collapse'}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {collapsed 
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                }
              </svg>
            </button>
            <button
              onClick={() => onCopy(id)}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
              title="Copy (⌘C)"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
            <button
              onClick={() => onDelete(id)}
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
              title="Delete"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        {renderBody()}
      </div>
    </>
  )
}

// ============================================
// EXPORT
// ============================================

export const nodeTypes = {
  custom: NodeComponent
}
