'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

// ============================================
// TYPES
// ============================================

export interface ClipboardNode {
  archetype: string
  content: {
    title?: string
    body?: string
    ui?: {
      color?: string
      collapsed?: boolean
    }
    [key: string]: unknown
  }
  width: number
  height: number
}

interface ClipboardContextValue {
  clipboard: ClipboardNode | null
  setClipboard: (node: ClipboardNode | null) => void
  clearClipboard: () => void
  hasClipboard: boolean
}

// ============================================
// CONTEXT
// ============================================

const ClipboardContext = createContext<ClipboardContextValue | null>(null)

// ============================================
// PROVIDER
// ============================================

interface ClipboardProviderProps {
  children: ReactNode
}

/**
 * ClipboardProvider - Project-scoped clipboard
 * 
 * Montato nel layout di /projects/[id]/
 * - Persiste tra board dello stesso progetto
 * - Si resetta quando cambi progetto
 * - State React, nessuna persistenza su reload
 * - 1 nodo solo
 */
export function ClipboardProvider({ children }: ClipboardProviderProps) {
  const [clipboard, setClipboard] = useState<ClipboardNode | null>(null)

  const clearClipboard = () => setClipboard(null)
  const hasClipboard = clipboard !== null

  return (
    <ClipboardContext.Provider 
      value={{ 
        clipboard, 
        setClipboard, 
        clearClipboard,
        hasClipboard 
      }}
    >
      {children}
    </ClipboardContext.Provider>
  )
}

// ============================================
// HOOK
// ============================================

/**
 * useClipboard - Hook per accedere al clipboard
 * 
 * @throws Error se usato fuori da ClipboardProvider
 */
export function useClipboard(): ClipboardContextValue {
  const context = useContext(ClipboardContext)
  
  if (!context) {
    throw new Error('useClipboard must be used within a ClipboardProvider')
  }
  
  return context
}
