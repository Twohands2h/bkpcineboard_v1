'use client'

import type { WorkspaceInfo } from '@/components/boards/board-canvas'

// ============================================
// TYPES
// ============================================

interface CanonicalBadgeProps {
  nodeVariant: string
  nodeContent: {
    body?: string
    items?: Array<{ url: string; source?: string; caption?: string }>
  }
  workspaceInfo?: WorkspaceInfo  // Phase 2J: passed from node data
}

// ============================================
// COMPONENT
// ============================================

/**
 * CanonicalBadge - Indica che il contenuto di questo nodo è usato come canonico
 * 
 * - Crown icon (♕) per master_prompt
 * - Diamond icon (◈) per reference_images
 * 
 * NOTA: Indica "usato come canonico", NON "bloccato" o "protetto".
 * Il contenuto può essere modificato e ri-promosso in qualsiasi momento.
 * 
 * Questo componente viene renderizzato come OVERLAY FLOATING fuori dal nodo,
 * nello stesso layer dei resize handles.
 */
export function CanonicalBadge({ nodeVariant, nodeContent, workspaceInfo }: CanonicalBadgeProps) {
  // Solo in Entity workspaces
  if (!workspaceInfo?.isWorkspace || workspaceInfo?.targetType !== 'entity') {
    return null
  }
  
  // Check se il Prompt content corrisponde al canonical master_prompt
  if (nodeVariant === 'prompt') {
    const promptBody = nodeContent.body?.trim()
    const canonicalPrompt = workspaceInfo.canonicalMasterPrompt?.trim()
    
    // Deve avere contenuto e corrispondere esattamente
    const isCanonical = 
      promptBody && 
      canonicalPrompt && 
      promptBody === canonicalPrompt
    
    if (!isCanonical) return null
    
    return (
      <div 
        className="w-6 h-6 bg-amber-500 text-white rounded-full flex items-center justify-center shadow-md border-2 border-white"
        title="Used as Master Prompt"
      >
        <span className="text-xs font-bold">♕</span>
      </div>
    )
  }
  
  // Check se l'Image URL è nel canonical reference_images
  if (nodeVariant === 'image') {
    const imageUrl = nodeContent.items?.[0]?.url
    const canonicalImages = workspaceInfo.canonicalReferenceImages
    
    // Deve avere URL e essere nella lista canonical
    const isCanonical = 
      imageUrl && 
      canonicalImages && 
      canonicalImages.includes(imageUrl)
    
    if (!isCanonical) return null
    
    return (
      <div 
        className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center shadow-md border-2 border-white"
        title="Used as Reference Image"
      >
        <span className="text-xs font-bold">◈</span>
      </div>
    )
  }
  
  // Altri tipi di nodo non hanno badge canonical
  return null
}
