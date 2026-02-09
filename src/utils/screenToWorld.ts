// ============================================================
// VIEWPORT TRANSFORM UTILITIES
// ============================================================
// Status: CANONICAL (R4-005)
// Pure functions. No React. No side effects.
//
// The canvas uses world coordinates for all nodes.
// The viewport applies scale + translate for display.
// These utilities convert between the two coordinate spaces.
// ============================================================

export interface ViewportState {
  scale: number
  offsetX: number
  offsetY: number
}

/**
 * Convert screen coordinates (mouse position relative to canvas container)
 * to world coordinates (where nodes live).
 *
 * Formula:
 *   worldX = (screenX - offsetX) / scale
 *   worldY = (screenY - offsetY) / scale
 *
 * @param screenX - X relative to canvas container's left edge
 * @param screenY - Y relative to canvas container's top edge
 * @param viewport - Current viewport state
 */
export function screenToWorld(
  screenX: number,
  screenY: number,
  viewport: ViewportState
): { x: number; y: number } {
  return {
    x: (screenX - viewport.offsetX) / viewport.scale,
    y: (screenY - viewport.offsetY) / viewport.scale,
  }
}

/**
 * Convert world coordinates to screen coordinates.
 *
 * Formula:
 *   screenX = worldX * scale + offsetX
 *   screenY = worldY * scale + offsetY
 */
export function worldToScreen(
  worldX: number,
  worldY: number,
  viewport: ViewportState
): { x: number; y: number } {
  return {
    x: worldX * viewport.scale + viewport.offsetX,
    y: worldY * viewport.scale + viewport.offsetY,
  }
}

/**
 * Convert a screen-space delta (mouse movement) to world-space delta.
 * Used for drag and resize where we care about movement, not position.
 *
 * Formula:
 *   worldDelta = screenDelta / scale
 */
export function screenDeltaToWorld(
  dx: number,
  dy: number,
  scale: number
): { dx: number; dy: number } {
  return {
    dx: dx / scale,
    dy: dy / scale,
  }
}

/**
 * Compute new viewport state after zooming centered on a screen point.
 *
 * The key insight: the world point under the cursor must stay
 * under the cursor after zoom.
 *
 * @param viewport - Current viewport state
 * @param screenX - Cursor X relative to canvas container
 * @param screenY - Cursor Y relative to canvas container
 * @param newScale - Target scale value
 */
export function zoomAtPoint(
  viewport: ViewportState,
  screenX: number,
  screenY: number,
  newScale: number
): ViewportState {
  // World point under cursor before zoom
  const worldX = (screenX - viewport.offsetX) / viewport.scale
  const worldY = (screenY - viewport.offsetY) / viewport.scale

  // New offset so that same world point stays under cursor
  return {
    scale: newScale,
    offsetX: screenX - worldX * newScale,
    offsetY: screenY - worldY * newScale,
  }
}

/** Default viewport: no zoom, no pan */
export const VIEWPORT_INITIAL: ViewportState = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
}

/** Zoom limits */
export const ZOOM_MIN = 0.1
export const ZOOM_MAX = 3
export const ZOOM_STEP = 0.1
