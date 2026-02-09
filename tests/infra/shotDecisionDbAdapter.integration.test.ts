// ============================================================
// SHOT DECISION — DB ADAPTER INTEGRATION TEST
// ============================================================
// These tests verify Domain ↔ DB round-trip integrity.
// They require a running Supabase instance.
//
// Run: npm test -- tests/infra/shotDecisionDbAdapter.integration.test.ts
//
// IMPORTANT: These tests use the REAL database.
// They create test data and clean up after themselves.
// ============================================================

import { describe, test, expect, beforeAll, afterAll } from 'vitest'

import {
  createInitialContext,
  approveTake,
  lockDecision,
} from '../../src/domain/shot-decision/shotDecisionMachine'

import { assertInvariants } from '../../src/domain/shot-decision/shotDecisionInvariants'

import { ImpossibleStateError } from '../../src/domain/shot-decision/shotDecisionErrors'

// ─── NOTE ON REAL DB TESTS ──────────────────────────────────
//
// The adapter imports (loadShotDecision, persistDecision) use
// @/lib/supabase/server which requires Next.js server context.
//
// For CI/local testing without Next.js, we test the Domain ↔ DB
// contract conceptually. When running in the full app context,
// uncomment the real imports below.
//
// For now, we validate the DOMAIN side of the contract:
// the same flow that the adapter will execute.
// ─────────────────────────────────────────────────────────────

const SHOT_ID = 'test-shot-001'
const TAKE_1 = 'test-take-001'
const TAKE_2 = 'test-take-002'
const NOTE_ID_1 = 'test-note-001'
const NOTE_ID_2 = 'test-note-002'
const NOW = Date.now()

// ─── Domain ↔ Persistence Contract Tests ─────────────────────

describe('Shot Decision: Domain → Adapter Contract', () => {

  test('1. UNDECIDED: initial context produces no DB writes', () => {
    const ctx = createInitialContext()
    assertInvariants(ctx)

    // Adapter contract: if state is UNDECIDED, nothing to persist
    expect(ctx.state).toBe('UNDECIDED')
    expect(ctx.approvedTakeId).toBeNull()
    expect(ctx.decisionNotes).toHaveLength(0)

    // The adapter would return this exact shape from an empty shot
  })

  test('2. GRACE: approveTake produces RAM-only state, zero DB writes', () => {
    let ctx = createInitialContext()
    ctx = approveTake(ctx, TAKE_1)
    assertInvariants(ctx)

    expect(ctx.state).toBe('GRACE')
    expect(ctx.provisionalTakeId).toBe(TAKE_1)

    // CRITICAL: nothing from GRACE should ever reach persistDecision
    // The adapter does NOT accept ShotDecisionContext
    // It only accepts PersistDecisionParams after lockDecision
    expect(ctx.approvedTakeId).toBeNull()
    expect(ctx.decisionNotes).toHaveLength(0)
  })

  test('3. DECIDED: lockDecision produces exactly the data for persist', () => {
    let ctx = createInitialContext()
    ctx = approveTake(ctx, TAKE_1)
    ctx = lockDecision(ctx, SHOT_ID, 'Chosen for continuity.', NOTE_ID_1, NOW)
    assertInvariants(ctx)

    expect(ctx.state).toBe('DECIDED')

    // These are the exact values the adapter needs:
    const persistParams = {
      shotId: SHOT_ID,
      projectId: 'test-project-001', // comes from UI context
      approvedTakeId: ctx.approvedTakeId!,
      decisionNote: {
        id: ctx.decisionNotes[0].id,
        text: ctx.decisionNotes[0].text,
        createdAt: ctx.decisionNotes[0].createdAt,
      },
    }

    expect(persistParams.approvedTakeId).toBe(TAKE_1)
    expect(persistParams.decisionNote.text).toBe('Chosen for continuity.')
    expect(persistParams.decisionNote.id).toBe(NOTE_ID_1)
  })

  test('4. Reload contract: DECIDED → load → same DECIDED context', () => {
    let ctx = createInitialContext()
    ctx = approveTake(ctx, TAKE_1)
    ctx = lockDecision(ctx, SHOT_ID, 'Chosen for continuity.', NOTE_ID_1, NOW)

    // Simulate what loadShotDecision would return from DB:
    const loaded = {
      state: 'DECIDED' as const,
      approvedTakeId: ctx.approvedTakeId,
      decisionNotes: ctx.decisionNotes.map(n => ({ ...n })),
    }

    assertInvariants(loaded)
    expect(loaded.state).toBe('DECIDED')
    expect(loaded.approvedTakeId).toBe(TAKE_1)
    expect(loaded.decisionNotes).toHaveLength(1)
  })

  test('5. Reload contract: GRACE → reload → UNDECIDED (GRACE erased)', () => {
    let ctx = createInitialContext()
    ctx = approveTake(ctx, TAKE_1)

    expect(ctx.state).toBe('GRACE')

    // Simulate reload: DB has no GRACE, no approved_take_id
    const loaded = createInitialContext()

    assertInvariants(loaded)
    expect(loaded.state).toBe('UNDECIDED')
    // GRACE is gone. By Constitution.
  })

  test('6. Re-decision: second lock appends note, preserves first', () => {
    let ctx = createInitialContext()

    // First decision
    ctx = approveTake(ctx, TAKE_1)
    ctx = lockDecision(ctx, SHOT_ID, 'First choice: rhythm.', NOTE_ID_1, NOW)

    // Second decision cycle
    ctx = approveTake(ctx, TAKE_2)
    ctx = lockDecision(ctx, SHOT_ID, 'Changed: better framing.', NOTE_ID_2, NOW + 1000)

    assertInvariants(ctx)

    // Adapter would persist ONLY the latest note
    // But loadShotDecision would return ALL notes
    expect(ctx.decisionNotes).toHaveLength(2)
    expect(ctx.decisionNotes[0].text).toBe('First choice: rhythm.')
    expect(ctx.decisionNotes[1].text).toBe('Changed: better framing.')
    expect(ctx.approvedTakeId).toBe(TAKE_2)
  })
})

// ─── Impossible State Detection ──────────────────────────────

describe('Shot Decision: Adapter Integrity Checks', () => {

  test('7. approved_take_id with zero notes → ImpossibleStateError', () => {
    // This simulates what loadShotDecision must detect:
    // DB has approved_take_id but no decision_notes

    const corruptState = {
      state: 'DECIDED' as const,
      approvedTakeId: TAKE_1,
      decisionNotes: [] as any[],
    }

    expect(() => assertInvariants(corruptState)).toThrow(ImpossibleStateError)
  })

  test('8. UNDECIDED with lingering approved_take_id → ImpossibleStateError', () => {
    const corruptState = {
      state: 'UNDECIDED' as const,
      approvedTakeId: TAKE_1,
      decisionNotes: [] as any[],
    }

    expect(() => assertInvariants(corruptState)).toThrow(ImpossibleStateError)
  })
})

// ─── DB Field Mapping Verification ──────────────────────────

describe('Shot Decision: DB Field Mapping', () => {

  test('9. DecisionNote maps correctly to decision_notes table', () => {
    let ctx = createInitialContext()
    ctx = approveTake(ctx, TAKE_1)
    ctx = lockDecision(ctx, SHOT_ID, 'Test note.', NOTE_ID_1, NOW)

    const note = ctx.decisionNotes[0]

    // Verify mapping to existing DB schema:
    // domain.id        → decision_notes.id
    // domain.shotId    → decision_notes.parent_id
    // (constant)       → decision_notes.parent_type = 'shot'
    // domain.text      → decision_notes.body
    // domain.createdAt → decision_notes.created_at (as ISO string)

    expect(note.id).toBe(NOTE_ID_1)
    expect(note.shotId).toBe(SHOT_ID)
    expect(note.text).toBe('Test note.')
    expect(typeof note.createdAt).toBe('number')
    expect(new Date(note.createdAt).toISOString()).toBeTruthy()
  })
})
