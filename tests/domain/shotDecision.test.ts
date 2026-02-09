// ============================================================
// SHOT DECISION — DOMAIN TESTS
// ============================================================
// These tests defend the Constitution.
// If they fail, the model is broken — not the test.
// ============================================================

import {
  createInitialContext,
  approveTake,
  undoApproval,
  lockDecision,
  GRACE_PERIOD_MS,
} from '../../src/domain/shot-decision/shotDecisionMachine';

import { assertInvariants } from '../../src/domain/shot-decision/shotDecisionInvariants';

import {
  InvalidTransitionError,
  ImpossibleStateError,
} from '../../src/domain/shot-decision/shotDecisionErrors';



// ─── Helpers ─────────────────────────────────────────────────

const SHOT_ID = 'shot-001';
const TAKE_1 = 'take-001';
const TAKE_2 = 'take-002';
const TAKE_3 = 'take-003';
const NOTE_ID_1 = 'note-001';
const NOTE_ID_2 = 'note-002';
const NOW = 1707500000000;

// ─── Initial State ───────────────────────────────────────────

describe('createInitialContext', () => {
  test('returns UNDECIDED with no approvals and no notes', () => {
    const ctx = createInitialContext();

    expect(ctx.state).toBe('UNDECIDED');
    expect(ctx.approvedTakeId).toBeNull();
    expect(ctx.decisionNotes).toEqual([]);
    expect(ctx.provisionalTakeId).toBeUndefined();

    assertInvariants(ctx);
  });
});

// ─── Happy Path ──────────────────────────────────────────────

describe('Happy path: UNDECIDED → GRACE → DECIDED', () => {
  test('complete decision cycle', () => {
    let ctx = createInitialContext();

    // Approve a take → GRACE
    ctx = approveTake(ctx, TAKE_1);
    assertInvariants(ctx);
    expect(ctx.state).toBe('GRACE');
    expect(ctx.provisionalTakeId).toBe(TAKE_1);
    expect(ctx.approvedTakeId).toBeNull();
    expect(ctx.decisionNotes).toEqual([]);

    // Lock decision → DECIDED
    ctx = lockDecision(ctx, SHOT_ID, 'Chosen for continuity and rhythm.', NOTE_ID_1, NOW);
    assertInvariants(ctx);
    expect(ctx.state).toBe('DECIDED');
    expect(ctx.approvedTakeId).toBe(TAKE_1);
    expect(ctx.provisionalTakeId).toBeUndefined();
    expect(ctx.decisionNotes).toHaveLength(1);
    expect(ctx.decisionNotes[0].text).toBe('Chosen for continuity and rhythm.');
    expect(ctx.decisionNotes[0].shotId).toBe(SHOT_ID);
    expect(ctx.decisionNotes[0].id).toBe(NOTE_ID_1);
    expect(ctx.decisionNotes[0].createdAt).toBe(NOW);
  });
});

// ─── Ping-Pong (GRACE oscillation) ──────────────────────────

describe('Ping-pong during GRACE', () => {
  test('switching takes in GRACE does not create notes', () => {
    let ctx = createInitialContext();

    ctx = approveTake(ctx, TAKE_1);
    assertInvariants(ctx);
    expect(ctx.provisionalTakeId).toBe(TAKE_1);

    ctx = approveTake(ctx, TAKE_2);
    assertInvariants(ctx);
    expect(ctx.provisionalTakeId).toBe(TAKE_2);
    expect(ctx.state).toBe('GRACE');
    expect(ctx.decisionNotes).toHaveLength(0);

    ctx = approveTake(ctx, TAKE_3);
    assertInvariants(ctx);
    expect(ctx.provisionalTakeId).toBe(TAKE_3);
    expect(ctx.decisionNotes).toHaveLength(0);
  });

  test('undo after ping-pong returns to UNDECIDED with no trace', () => {
    let ctx = createInitialContext();

    ctx = approveTake(ctx, TAKE_1);
    ctx = approveTake(ctx, TAKE_2);
    ctx = undoApproval(ctx);

    assertInvariants(ctx);
    expect(ctx.state).toBe('UNDECIDED');
    expect(ctx.provisionalTakeId).toBeUndefined();
    expect(ctx.approvedTakeId).toBeNull();
    expect(ctx.decisionNotes).toHaveLength(0);
  });
});

// ─── Undo Semantics ─────────────────────────────────────────

describe('Undo semantics', () => {
  test('undo is allowed in GRACE', () => {
    let ctx = createInitialContext();
    ctx = approveTake(ctx, TAKE_1);
    ctx = undoApproval(ctx);

    assertInvariants(ctx);
    expect(ctx.state).toBe('UNDECIDED');
  });

  test('undo is FORBIDDEN after DECIDED', () => {
    let ctx = createInitialContext();
    ctx = approveTake(ctx, TAKE_1);
    ctx = lockDecision(ctx, SHOT_ID, 'Final choice.', NOTE_ID_1, NOW);

    expect(ctx.state).toBe('DECIDED');
    expect(() => undoApproval(ctx)).toThrow(InvalidTransitionError);
  });

  test('undo is FORBIDDEN from UNDECIDED (nothing to undo)', () => {
    const ctx = createInitialContext();
    expect(() => undoApproval(ctx)).toThrow(InvalidTransitionError);
  });
});

// ─── Lock Semantics ──────────────────────────────────────────

describe('Lock semantics', () => {
  test('lock is FORBIDDEN from UNDECIDED', () => {
    const ctx = createInitialContext();
    expect(() =>
      lockDecision(ctx, SHOT_ID, 'Attempt', NOTE_ID_1, NOW)
    ).toThrow(InvalidTransitionError);
  });

  test('lock is FORBIDDEN from DECIDED', () => {
    let ctx = createInitialContext();
    ctx = approveTake(ctx, TAKE_1);
    ctx = lockDecision(ctx, SHOT_ID, 'First decision.', NOTE_ID_1, NOW);

    expect(() =>
      lockDecision(ctx, SHOT_ID, 'Second attempt', NOTE_ID_2, NOW)
    ).toThrow(InvalidTransitionError);
  });

  test('lock with empty note text is FORBIDDEN', () => {
    let ctx = createInitialContext();
    ctx = approveTake(ctx, TAKE_1);

    expect(() =>
      lockDecision(ctx, SHOT_ID, '', NOTE_ID_1, NOW)
    ).toThrow(InvalidTransitionError);

    expect(() =>
      lockDecision(ctx, SHOT_ID, '   ', NOTE_ID_1, NOW)
    ).toThrow(InvalidTransitionError);
  });
});

// ─── Re-Decision Cycle ──────────────────────────────────────

describe('Re-decision cycle (DECIDED → new GRACE → new DECIDED)', () => {
  test('approving from DECIDED starts new cycle, preserves past notes', () => {
    let ctx = createInitialContext();

    // First decision
    ctx = approveTake(ctx, TAKE_1);
    ctx = lockDecision(ctx, SHOT_ID, 'First choice: rhythm.', NOTE_ID_1, NOW);
    assertInvariants(ctx);
    expect(ctx.state).toBe('DECIDED');
    expect(ctx.decisionNotes).toHaveLength(1);

    // Start new decision cycle
    ctx = approveTake(ctx, TAKE_2);
    expect(ctx.state).toBe('GRACE');
    expect(ctx.provisionalTakeId).toBe(TAKE_2);
    expect(ctx.approvedTakeId).toBeNull();
    // Past notes are preserved as memory
    expect(ctx.decisionNotes).toHaveLength(1);

    // Lock new decision
    ctx = lockDecision(ctx, SHOT_ID, 'Changed to Take 2: better framing.', NOTE_ID_2, NOW + 1000);
    assertInvariants(ctx);
    expect(ctx.state).toBe('DECIDED');
    expect(ctx.approvedTakeId).toBe(TAKE_2);
    expect(ctx.decisionNotes).toHaveLength(2);
    expect(ctx.decisionNotes[0].text).toBe('First choice: rhythm.');
    expect(ctx.decisionNotes[1].text).toBe('Changed to Take 2: better framing.');
  });

  test('undo during re-decision cycle returns to UNDECIDED, preserves notes', () => {
    let ctx = createInitialContext();

    // First decision
    ctx = approveTake(ctx, TAKE_1);
    ctx = lockDecision(ctx, SHOT_ID, 'First choice.', NOTE_ID_1, NOW);

    // Start new cycle, then undo
    ctx = approveTake(ctx, TAKE_2);
    ctx = undoApproval(ctx);

    expect(ctx.state).toBe('UNDECIDED');
    expect(ctx.approvedTakeId).toBeNull();
    expect(ctx.provisionalTakeId).toBeUndefined();
    // Memory of past decisions preserved
    expect(ctx.decisionNotes).toHaveLength(1);
  });
});

// ─── Impossible States (§7) ─────────────────────────────────

describe('Impossible states (State Machine §7)', () => {
  test('DECIDED without approvedTakeId → hard fail', () => {
    expect(() =>
      assertInvariants({
        state: 'DECIDED',
        approvedTakeId: null,
        decisionNotes: [{ id: '1', shotId: 's', text: 'x', createdAt: 0 }],
      })
    ).toThrow(ImpossibleStateError);
  });

  test('DECIDED without Decision Notes → hard fail', () => {
    expect(() =>
      assertInvariants({
        state: 'DECIDED',
        approvedTakeId: TAKE_1,
        decisionNotes: [],
      })
    ).toThrow(ImpossibleStateError);
  });

  test('GRACE without provisionalTakeId → hard fail', () => {
    expect(() =>
      assertInvariants({
        state: 'GRACE',
        approvedTakeId: null,
        decisionNotes: [],
      })
    ).toThrow(ImpossibleStateError);
  });

  test('UNDECIDED with approvedTakeId → hard fail', () => {
    expect(() =>
      assertInvariants({
        state: 'UNDECIDED',
        approvedTakeId: TAKE_1,
        decisionNotes: [],
      })
    ).toThrow(ImpossibleStateError);
  });

  test('UNDECIDED with provisionalTakeId → hard fail', () => {
    expect(() =>
      assertInvariants({
        state: 'UNDECIDED',
        approvedTakeId: null,
        decisionNotes: [],
        provisionalTakeId: TAKE_1,
      })
    ).toThrow(ImpossibleStateError);
  });
});

// ─── Immutability ────────────────────────────────────────────

describe('Immutability guarantees', () => {
  test('approveTake returns a new object, original unchanged', () => {
    const original = createInitialContext();
    const next = approveTake(original, TAKE_1);

    expect(original.state).toBe('UNDECIDED');
    expect(next.state).toBe('GRACE');
    expect(original).not.toBe(next);
  });

  test('lockDecision returns a new object, original unchanged', () => {
    let ctx = createInitialContext();
    ctx = approveTake(ctx, TAKE_1);

    const beforeLock = ctx;
    const afterLock = lockDecision(ctx, SHOT_ID, 'Reason.', NOTE_ID_1, NOW);

    expect(beforeLock.state).toBe('GRACE');
    expect(afterLock.state).toBe('DECIDED');
    expect(beforeLock).not.toBe(afterLock);
  });

  test('decisionNotes array is never mutated', () => {
    let ctx = createInitialContext();
    ctx = approveTake(ctx, TAKE_1);
    ctx = lockDecision(ctx, SHOT_ID, 'First.', NOTE_ID_1, NOW);

    const notesAfterFirst = ctx.decisionNotes;

    ctx = approveTake(ctx, TAKE_2);
    ctx = lockDecision(ctx, SHOT_ID, 'Second.', NOTE_ID_2, NOW + 1000);

    // Original array reference unchanged
    expect(notesAfterFirst).toHaveLength(1);
    expect(ctx.decisionNotes).toHaveLength(2);
  });
});

// ─── Constants ───────────────────────────────────────────────

describe('Constants', () => {
  test('GRACE_PERIOD_MS is 60 seconds', () => {
    expect(GRACE_PERIOD_MS).toBe(60_000);
  });
});
