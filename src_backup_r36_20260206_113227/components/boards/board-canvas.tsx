'use client'

import { useCallback, useRef, useState, useEffect, useMemo } from 'react'
import ReactFlow, {
  ReactFlowProvider,
  useReactFlow,
  type Viewport,
  type Node,
  type NodeChange,
  applyNodeChanges,
} from 'reactflow'
import 'reactflow/dist/style.css'

import { updateCanvasStateAction } from '@/app/actions/boards'
import {
  createNodeAction,
  updateNodeAction,
  deleteNodeAction,
  type NodeArchetype,
  type NodeVariant,
  type BaseNodeContent
} from '@/app/actions/nodes'
import { nodeTypes } from './node-component'
import { useClipboard, type ClipboardNode } from '@/contexts/clipboard-context'
import { useEntityLibrary } from '@/contexts/entity-library-context'

// ============================================
// CONSTANTS — Visual Foundation
// ============================================

const DEFAULT_WIDTH = 220
const DEFAULT_HEIGHT = 140
const COLLAPSED_HEIGHT = 44

const BOARD_CONFIG = {
  initialWidth: 1200,
  initialHeight: 800,
  padding: 100,
  panThreshold: 0.7,
}

const VALID_ARCHETYPES: NodeArchetype[] = ['content', 'structural', 'reference']

// Phase 2K: Entity variants trigger selector dialog
const ENTITY_VARIANTS = ['character', 'environment', 'asset']

// ============================================
// TYPES
// ============================================

interface BoardNodeData {
  id: string
  board_id: string
  node_type: string
  position_x: number
  position_y: number
  width: number | null
  height: number | null
  content: Record<string, unknown>
  status: string
}

// Phase 2J: Workspace context for nodes
export interface WorkspaceInfo {
  isWorkspace: boolean
  targetType: 'entity' | 'shot' | null
  targetId: string | null
  targetName: string | null
  projectId: string
  canonicalMasterPrompt?: string | null
  canonicalReferenceImages?: string[] | null
  canonicalShotDescription?: string | null
}

// Phase 2K: Pending entity drop for selector dialog
export interface PendingEntityDrop {
  position: { x: number; y: number }
  entityType: 'character' | 'environment' | 'asset'
}

interface BoardCanvasProps {
  boardId: string
  projectId: string
  initialViewport?: {
    x: number
    y: number
    zoom: number
  }
  initialNodes: BoardNodeData[]
  onSelectionChange?: (selectedIds: string[]) => void
  onEntityDrop?: (drop: PendingEntityDrop) => void  // Phase 2K
  onNodeAdded?: (callback: (node: BoardNodeData) => void) => void  // Phase 2K: register callback
  onNodesRemoved?: (callback: (nodeIds: string[]) => void) => void  // Crystallize: register callback
  workspaceInfo?: WorkspaceInfo  // Phase 2J
}

// ============================================
// UTILITY: Calculate nodes bounding box
// ============================================

function calculateBoundingBox(nodes: Node[]) {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 }
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  nodes.forEach(node => {
    const width = (node.style?.width as number) || DEFAULT_WIDTH
    const height = (node.style?.height as number) || DEFAULT_HEIGHT

    minX = Math.min(minX, node.position.x)
    minY = Math.min(minY, node.position.y)
    maxX = Math.max(maxX, node.position.x + width)
    maxY = Math.max(maxY, node.position.y + height)
  })

  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

// ============================================
// UTILITY: Check if two nodes overlap horizontally (same column)
// ============================================

function nodesOverlapHorizontally(
  nodeA: { x: number; width: number },
  nodeB: { x: number; width: number }
): boolean {
  return nodeB.x < nodeA.x + nodeA.width && nodeB.x + nodeB.width > nodeA.x
}

// ============================================
// UTILITY: Find nodes below in same column
// ============================================

function findNodesBelowInColumn(
  changedNode: { id: string; x: number; y: number; width: number; height: number },
  allNodes: Node[]
): Node[] {
  return allNodes.filter(node => {
    if (node.id === changedNode.id) return false

    const nodeWidth = (node.style?.width as number) || DEFAULT_WIDTH

    // È sotto il nodo cambiato?
    const isBelow = node.position.y >= changedNode.y + changedNode.height - 10 // piccola tolleranza

    // È nella stessa colonna (overlap orizzontale)?
    const sameColumn = nodesOverlapHorizontally(
      { x: changedNode.x, width: changedNode.width },
      { x: node.position.x, width: nodeWidth }
    )

    return isBelow && sameColumn
  })
}

// ============================================
// BOARD CANVAS INNER
// ============================================

function BoardCanvasInner({
  boardId,
  projectId,
  initialViewport,
  initialNodes,
  onSelectionChange,
  onEntityDrop,    // Phase 2K
  onNodeAdded,     // Phase 2K
  onNodesRemoved,  // Crystallize
  workspaceInfo    // Phase 2J
}: BoardCanvasProps) {
  const reactFlowInstance = useReactFlow()
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const [wrapperSize, setWrapperSize] = useState({ width: 0, height: 0 })

  const { clipboard, setClipboard, clearClipboard } = useClipboard()
  const { openEntityDetail } = useEntityLibrary()
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])

  // ============================================
  // Track wrapper size
  // ============================================

  useEffect(() => {
    if (!reactFlowWrapper.current) return

    const updateSize = () => {
      if (reactFlowWrapper.current) {
        setWrapperSize({
          width: reactFlowWrapper.current.offsetWidth,
          height: reactFlowWrapper.current.offsetHeight
        })
      }
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(reactFlowWrapper.current)

    return () => observer.disconnect()
  }, [])

  // ============================================
  // NODE HANDLERS
  // ============================================

  const handleNodeUpdate = useCallback(async (
    nodeId: string,
    updates: { content?: Partial<BaseNodeContent>; size?: { width: number; height: number } }
  ) => {
    setNodes((nds) => {
      // Trova il nodo corrente
      const currentNode = nds.find(n => n.id === nodeId)
      if (!currentNode) return nds

      const currentHeight = (currentNode.style?.height as number) || DEFAULT_HEIGHT
      const currentWidth = (currentNode.style?.width as number) || DEFAULT_WIDTH
      const newHeight = updates.size?.height || currentHeight
      const heightDelta = newHeight - currentHeight

      // Aggiorna il nodo principale
      let updatedNodes = nds.map((node) => {
        if (node.id === nodeId) {
          const currentContent = (node.data.content || {}) as BaseNodeContent
          return {
            ...node,
            style: updates.size
              ? { ...node.style, width: updates.size.width, height: updates.size.height }
              : node.style,
            data: {
              ...node.data,
              content: updates.content
                ? {
                  ...currentContent,
                  ...updates.content,
                  ui: {
                    ...currentContent.ui,
                    ...updates.content.ui
                  }
                }
                : currentContent,
            },
          }
        }
        return node
      })

      // Se l'altezza è cambiata, sposta i nodi sotto nella stessa colonna
      if (heightDelta !== 0) {
        const changedNodeInfo = {
          id: nodeId,
          x: currentNode.position.x,
          y: currentNode.position.y,
          width: currentWidth,
          height: currentHeight // usa altezza PRIMA del cambio per trovare nodi sotto
        }

        const nodesBelow = findNodesBelowInColumn(changedNodeInfo, nds)
        const nodesBelowIds = new Set(nodesBelow.map(n => n.id))

        updatedNodes = updatedNodes.map(node => {
          if (nodesBelowIds.has(node.id)) {
            return {
              ...node,
              position: {
                ...node.position,
                y: node.position.y + heightDelta
              }
            }
          }
          return node
        })

        // Persisti posizioni dei nodi spostati
        nodesBelow.forEach(node => {
          updateNodeAction(node.id, {
            position: { x: node.position.x, y: node.position.y + heightDelta }
          }).catch(console.error)
        })
      }

      return updatedNodes
    })

    // Persisti update del nodo principale
    try {
      await updateNodeAction(nodeId, updates)
    } catch (error) {
      console.error('Failed to update node:', error)
    }
  }, [])

  const handleNodeDelete = useCallback(async (nodeId: string) => {
    // console.log('DELETE CALLED:', nodeId)  ← rimuovi
    setNodes((nds) => nds.filter((node) => node.id !== nodeId))

    try {
      await deleteNodeAction(nodeId)
      // console.log('DELETE SUCCESS:', nodeId)  ← rimuovi
    } catch (error) {
      console.error('Failed to delete node:', error)
    }
  }, [])

  const handleNodeCopy = useCallback((nodeId: string) => {
    setNodes((nds) => {
      const node = nds.find(n => n.id === nodeId)
      if (node) {
        const clipboardData: ClipboardNode = {
          archetype: node.data.archetype,
          content: node.data.content,
          width: (node.style?.width as number) || DEFAULT_WIDTH,
          height: (node.style?.height as number) || DEFAULT_HEIGHT,
        }
        setClipboard(clipboardData)
      }
      return nds
    })
  }, [setClipboard])

  const handleNodeNavigate = useCallback((refType: string, refId: string) => {
    if (refType === 'entity' && refId) {
      // Open Entity Library drawer directly on Entity Detail
      openEntityDetail(refId, 'entity-ref')
    }
  }, [openEntityDetail])

  const pasteNode = useCallback(async (position: { x: number; y: number }) => {
    if (!clipboard) return

    try {
      const variant = (clipboard.content.variant as NodeVariant) || 'note'

      const newNode = await createNodeAction(
        boardId,
        clipboard.archetype as NodeArchetype,
        variant,
        position,
        clipboard.content
      )

      // Se dimensioni diverse da default, update
      if (clipboard.width !== DEFAULT_WIDTH || clipboard.height !== DEFAULT_HEIGHT) {
        await updateNodeAction(newNode.id, {
          size: { width: clipboard.width, height: clipboard.height }
        })
      }

      setNodes((nds) => [
        ...nds,
        {
          id: newNode.id,
          type: 'custom',
          position: { x: position.x, y: position.y },
          style: { width: clipboard.width, height: clipboard.height },
          data: {
            id: newNode.id,
            archetype: clipboard.archetype,
            content: clipboard.content,
            onUpdate: handleNodeUpdate,
            onDelete: handleNodeDelete,
            onCopy: handleNodeCopy,
            onNavigate: handleNodeNavigate,
            workspaceInfo,
          },
        },
      ])

      clearClipboard()
    } catch (error) {
      console.error('Failed to paste node:', error)
    }
  }, [boardId, clipboard, clearClipboard, handleNodeUpdate, handleNodeDelete, handleNodeCopy, handleNodeNavigate, workspaceInfo])

  // ============================================
  // CONVERT DB NODES
  // ============================================

  const convertToFlowNodes = useCallback((dbNodes: BoardNodeData[]): Node[] => {
    return dbNodes
      .filter(node => node.status === 'active')
      .map((node) => ({
        id: node.id,
        type: 'custom',
        position: { x: node.position_x, y: node.position_y },
        style: { width: node.width ?? DEFAULT_WIDTH, height: node.height ?? DEFAULT_HEIGHT },
        data: {
          id: node.id,
          archetype: node.node_type,
          content: node.content,
          onUpdate: handleNodeUpdate,
          onDelete: handleNodeDelete,
          onCopy: handleNodeCopy,
          onNavigate: handleNodeNavigate,
          workspaceInfo,
        },
      }))
  }, [handleNodeUpdate, handleNodeDelete, handleNodeCopy, handleNodeNavigate, workspaceInfo])

  // ============================================
  // STATE
  // ============================================

  const [nodes, setNodes] = useState<Node[]>(() => convertToFlowNodes(initialNodes))

  // Update workspaceInfo in all nodes when it changes
  useEffect(() => {
    setNodes(nds => nds.map(node => ({
      ...node,
      data: {
        ...node.data,
        workspaceInfo,
      }
    })))
  }, [workspaceInfo])

  // ============================================
  // Phase 2K: Add node callback for external use
  // ============================================

  const addNodeToCanvasRef = useRef<(dbNode: BoardNodeData) => void>()

  addNodeToCanvasRef.current = (dbNode: BoardNodeData) => {
    const flowNode: Node = {
      id: dbNode.id,
      type: 'custom',
      position: { x: dbNode.position_x, y: dbNode.position_y },
      style: { width: dbNode.width ?? DEFAULT_WIDTH, height: dbNode.height ?? DEFAULT_HEIGHT },
      data: {
        id: dbNode.id,
        archetype: dbNode.node_type,
        content: dbNode.content,
        onUpdate: handleNodeUpdate,
        onDelete: handleNodeDelete,
        onCopy: handleNodeCopy,
        onNavigate: handleNodeNavigate,
        workspaceInfo,
      },
    }
    setNodes((nds) => [...nds, flowNode])
  }

  // Stable callback wrapper that always uses latest ref
  const addNodeToCanvas = useCallback((dbNode: BoardNodeData) => {
    addNodeToCanvasRef.current?.(dbNode)
  }, [])

  // Register the callback with parent (only once)
  useEffect(() => {
    onNodeAdded?.(addNodeToCanvas)
  }, [onNodeAdded, addNodeToCanvas])

  // ============================================
  // REMOVE NODES FROM CANVAS (Crystallize)
  // ============================================

  // Remove nodes by ID (used by Crystallize to remove archived nodes)
  const removeNodesFromCanvas = useCallback((nodeIds: string[]) => {
    setNodes((nds) => nds.filter(n => !nodeIds.includes(n.id)))
  }, [])

  // Register the callback with parent
  useEffect(() => {
    onNodesRemoved?.(removeNodesFromCanvas)
  }, [onNodesRemoved, removeNodesFromCanvas])

  // ============================================
  // PAN/ZOOM CONTROL
  // ============================================

  const interactionState = useMemo(() => {
    const bbox = calculateBoundingBox(nodes)
    const viewportWidth = wrapperSize.width || BOARD_CONFIG.initialWidth
    const viewportHeight = wrapperSize.height || BOARD_CONFIG.initialHeight

    const contentWidth = bbox.width + BOARD_CONFIG.padding * 2
    const contentHeight = bbox.height + BOARD_CONFIG.padding * 2

    // Pan attivo solo se contenuto > viewport
    const needsPan = nodes.length > 0 && (
      contentWidth > viewportWidth * BOARD_CONFIG.panThreshold ||
      contentHeight > viewportHeight * BOARD_CONFIG.panThreshold
    )

    return {
      // Pan condizionale
      panOnDrag: needsPan,
      panOnScroll: needsPan,
      // Zoom SEMPRE attivo, ma con range diverso
      zoomOnScroll: true,
      zoomOnPinch: true,
      minZoom: needsPan ? 0.3 : 0.8,
      maxZoom: needsPan ? 2 : 1.5,
    }
  }, [nodes, wrapperSize])

  // ============================================
  // INITIAL VIEWPORT
  // ============================================

  const centeredViewport = useMemo((): Viewport => {
    if (initialViewport) return initialViewport

    return {
      x: 0,
      y: 0,
      zoom: 1,
    }
  }, [initialViewport])

  // ============================================
  // KEYBOARD SHORTCUTS
  // ============================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        if (selectedNodeIds.length === 1) {
          handleNodeCopy(selectedNodeIds[0])
          e.preventDefault()
        }
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        if (clipboard) {
          const viewport = reactFlowInstance.getViewport()
          const viewportWidth = wrapperSize.width || BOARD_CONFIG.initialWidth
          const viewportHeight = wrapperSize.height || BOARD_CONFIG.initialHeight

          const centerX = (-viewport.x + viewportWidth / 2) / viewport.zoom
          const centerY = (-viewport.y + viewportHeight / 2) / viewport.zoom
          pasteNode({ x: centerX, y: centerY })
          e.preventDefault()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedNodeIds, clipboard, handleNodeCopy, pasteNode, reactFlowInstance, wrapperSize])

  // ============================================
  // REACT FLOW HANDLERS
  // ============================================

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => {
      const updatedNodes = applyNodeChanges(changes, nds)

      // Track selection changes
      const selectionChanges = changes.filter(c => c.type === 'select')
      if (selectionChanges.length > 0) {
        const newSelectedIds = updatedNodes.filter(n => n.selected).map(n => n.id)
        // Use setTimeout to avoid state update during render
        setTimeout(() => {
          setSelectedNodeIds(newSelectedIds)
          onSelectionChange?.(newSelectedIds)
        }, 0)
      }

      return updatedNodes
    })

    changes.forEach((change) => {
      if (
        change.type === 'position' &&
        change.position &&
        change.dragging === false
      ) {
        updateNodeAction(change.id, {
          position: { x: change.position.x, y: change.position.y }
        }).catch(console.error)
      }
    })
  }, [onSelectionChange])

  const handleMoveEnd = useCallback(
    (_event: unknown, viewport: Viewport) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }

      debounceRef.current = setTimeout(() => {
        updateCanvasStateAction(boardId, {
          x: viewport.x,
          y: viewport.y,
          zoom: viewport.zoom,
        })
      }, 500)
    },
    [boardId]
  )

  // ============================================
  // DRAG & DROP — On wrapper div, not ReactFlow
  // ============================================

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault()

      const archetype = event.dataTransfer.getData('application/cineboard-archetype')
      const variant = event.dataTransfer.getData('application/cineboard-variant')

      if (!archetype || !variant || !reactFlowWrapper.current) return

      if (!VALID_ARCHETYPES.includes(archetype as NodeArchetype)) {
        console.error('Invalid archetype:', archetype)
        return
      }

      const bounds = reactFlowWrapper.current.getBoundingClientRect()
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      })

      // Phase 2K: Entity drop triggers selector dialog
      if (archetype === 'reference' && ENTITY_VARIANTS.includes(variant)) {
        onEntityDrop?.({
          position,
          entityType: variant as 'character' | 'environment' | 'asset'
        })
        return
      }

      try {
        const newNode = await createNodeAction(
          boardId,
          archetype as NodeArchetype,
          variant as NodeVariant,
          position
        )

        setNodes((nds) => [
          ...nds,
          {
            id: newNode.id,
            type: 'custom',
            position: { x: newNode.position_x, y: newNode.position_y },
            style: { width: newNode.width ?? DEFAULT_WIDTH, height: newNode.height ?? DEFAULT_HEIGHT },
            data: {
              id: newNode.id,
              archetype: newNode.node_type,
              content: newNode.content,
              onUpdate: handleNodeUpdate,
              onDelete: handleNodeDelete,
              onCopy: handleNodeCopy,
              onNavigate: handleNodeNavigate,
              workspaceInfo,  // Phase 2J
            },
          },
        ])
      } catch (error) {
        console.error('Failed to create node:', error)
      }
    },
    [boardId, reactFlowInstance, handleNodeUpdate, handleNodeDelete, handleNodeCopy, handleNodeNavigate, workspaceInfo, onEntityDrop]
  )

  // ============================================
  // CANVAS CLICK - Paste
  // ============================================

  const onPaneClick = useCallback((event: React.MouseEvent) => {
    if (clipboard && reactFlowWrapper.current) {
      const bounds = reactFlowWrapper.current.getBoundingClientRect()
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      })
      pasteNode(position)
    }
  }, [clipboard, pasteNode, reactFlowInstance])

  // ============================================
  // RENDER
  // ============================================

  return (
    <div
      ref={reactFlowWrapper}
      className="w-full h-full"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <ReactFlow
        nodes={nodes}
        edges={[]}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        defaultViewport={centeredViewport}
        onMoveEnd={handleMoveEnd}
        onPaneClick={onPaneClick}
        // Zoom sempre attivo
        zoomOnScroll={interactionState.zoomOnScroll}
        zoomOnPinch={interactionState.zoomOnPinch}
        minZoom={interactionState.minZoom}
        maxZoom={interactionState.maxZoom}
        // Pan condizionale
        panOnDrag={interactionState.panOnDrag}
        panOnScroll={interactionState.panOnScroll}
        // Sempre attivi
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        selectionOnDrag={false}
        // Selezione multipla con Shift
        multiSelectionKeyCode="Shift"
        selectionKeyCode="Shift"
        // React Flow
        proOptions={{ hideAttribution: true }}
        fitView={false}
        // Styling
        style={{
          background: '#fafafa',
          cursor: clipboard ? 'copy' : 'default'
        }}
      />
    </div>
  )
}

// ============================================
// BOARD CANVAS (with Provider)
// ============================================

export function BoardCanvas({
  boardId,
  projectId,
  initialViewport,
  initialNodes,
  onSelectionChange,
  onEntityDrop,    // Phase 2K
  onNodeAdded,     // Phase 2K
  onNodesRemoved,  // Crystallize
  workspaceInfo    // Phase 2J
}: BoardCanvasProps) {
  return (
    <ReactFlowProvider>
      <BoardCanvasInner
        boardId={boardId}
        projectId={projectId}
        initialViewport={initialViewport}
        initialNodes={initialNodes}
        onSelectionChange={onSelectionChange}
        onEntityDrop={onEntityDrop}
        onNodeAdded={onNodeAdded}
        onNodesRemoved={onNodesRemoved}
        workspaceInfo={workspaceInfo}
      />
    </ReactFlowProvider>
  )
}
