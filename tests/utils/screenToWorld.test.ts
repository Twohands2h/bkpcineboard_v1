// ============================================================
// VIEWPORT TRANSFORM — TESTS
// ============================================================

import { describe, test, expect } from 'vitest'
import {
  screenToWorld,
  worldToScreen,
  screenDeltaToWorld,
  zoomAtPoint,
  VIEWPORT_INITIAL,
} from '../../src/utils/screenToWorld'

describe('screenToWorld', () => {
  test('identity at scale=1, offset=0', () => {
    const result = screenToWorld(100, 200, VIEWPORT_INITIAL)
    expect(result.x).toBe(100)
    expect(result.y).toBe(200)
  })

  test('with scale=2, screen point maps to half world coords', () => {
    const vp = { scale: 2, offsetX: 0, offsetY: 0 }
    const result = screenToWorld(200, 400, vp)
    expect(result.x).toBe(100)
    expect(result.y).toBe(200)
  })

  test('with offset, screen point shifts inversely', () => {
    const vp = { scale: 1, offsetX: 50, offsetY: 100 }
    const result = screenToWorld(150, 300, vp)
    expect(result.x).toBe(100)
    expect(result.y).toBe(200)
  })

  test('with scale and offset combined', () => {
    const vp = { scale: 2, offsetX: 100, offsetY: 200 }
    const result = screenToWorld(300, 600, vp)
    expect(result.x).toBe(100)
    expect(result.y).toBe(200)
  })
})

describe('worldToScreen', () => {
  test('identity at scale=1, offset=0', () => {
    const result = worldToScreen(100, 200, VIEWPORT_INITIAL)
    expect(result.x).toBe(100)
    expect(result.y).toBe(200)
  })

  test('inverse of screenToWorld', () => {
    const vp = { scale: 2, offsetX: 100, offsetY: 200 }
    const world = screenToWorld(300, 600, vp)
    const screen = worldToScreen(world.x, world.y, vp)
    expect(screen.x).toBeCloseTo(300)
    expect(screen.y).toBeCloseTo(600)
  })
})

describe('screenDeltaToWorld', () => {
  test('at scale=1, delta is unchanged', () => {
    const result = screenDeltaToWorld(10, 20, 1)
    expect(result.dx).toBe(10)
    expect(result.dy).toBe(20)
  })

  test('at scale=2, delta is halved', () => {
    const result = screenDeltaToWorld(10, 20, 2)
    expect(result.dx).toBe(5)
    expect(result.dy).toBe(10)
  })

  test('at scale=0.5, delta is doubled', () => {
    const result = screenDeltaToWorld(10, 20, 0.5)
    expect(result.dx).toBe(20)
    expect(result.dy).toBe(40)
  })
})

describe('zoomAtPoint', () => {
  test('zoom in at center keeps world point stable', () => {
    const vp = VIEWPORT_INITIAL
    const result = zoomAtPoint(vp, 500, 500, 2)

    // World point under cursor before: (500, 500)
    // After zoom: same world point should still be at (500, 500) screen
    const worldBefore = screenToWorld(500, 500, vp)
    const worldAfter = screenToWorld(500, 500, result)

    expect(worldAfter.x).toBeCloseTo(worldBefore.x)
    expect(worldAfter.y).toBeCloseTo(worldBefore.y)
  })

  test('zoom at corner keeps corner world point stable', () => {
    const vp = { scale: 1, offsetX: 100, offsetY: 50 }
    const screenX = 0, screenY = 0

    const worldBefore = screenToWorld(screenX, screenY, vp)
    const result = zoomAtPoint(vp, screenX, screenY, 1.5)
    const worldAfter = screenToWorld(screenX, screenY, result)

    expect(worldAfter.x).toBeCloseTo(worldBefore.x)
    expect(worldAfter.y).toBeCloseTo(worldBefore.y)
  })

  test('zoom out preserves cursor world point', () => {
    const vp = { scale: 2, offsetX: 200, offsetY: 100 }
    const screenX = 400, screenY = 300

    const worldBefore = screenToWorld(screenX, screenY, vp)
    const result = zoomAtPoint(vp, screenX, screenY, 0.5)
    const worldAfter = screenToWorld(screenX, screenY, result)

    expect(worldAfter.x).toBeCloseTo(worldBefore.x)
    expect(worldAfter.y).toBeCloseTo(worldBefore.y)
  })
})
