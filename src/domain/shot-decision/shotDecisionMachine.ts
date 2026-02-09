// ============================================================
// SHOT DECISION — STATE MACHINE
// ============================================================
// Status: CANONICAL / NON-INTERPRETABLE
// Source of truth: SHOT_DECISION_STATE_MACHINE.md
// Constitution: "CineBoard does not remember what you tried.
//                It remembers what you chose — and why."
// ============================================================
// Pure functions. No React. No DB. No side effects.
// Every function returns a new context. Nothing is mutated.
// ============================================================

import type {
  ShotDecisionContext,
  TakeId,
  DecisionNote,
} from './shotDecisionTypes';

import {
  InvalidTransitionError,
  ImpossibleStateError,
} from './shotDecisionErrors';

// ─── Constants ───────────────────────────────────────────────

/**
 * Grace period duration in milliseconds.
 * The domain layer does not enforce this timer.
 * Timer management is a UI/infrastructure concern.
 */
export const GRACE_PERIOD_MS = 60_000;

// ─── Factory ─────────────────────────────────────────────────

/**
 * Creates the initial decision context for a Shot.
 * State: UNDECIDED — no editorial decision exists.
 */
export function createInitialContext(): ShotDecisionContext {
  return {
    state: 'UNDECIDED',
    approvedTakeId: null,
    decisionNotes: [],
  };
}

// ─── Transitions ─────────────────────────────────────────────

/**
 * ApproveTake — Select a Take as provisional choice.
 *
 * Valid from:
 *   UNDECIDED → GRACE (new provisional)
 *   GRACE     → GRACE (ping-pong, replace provisional)
 *   DECIDED   → GRACE (new decision cycle)
 *
 * This transition:
 * - never writes to DB
 * - never creates Decision Notes
 * - never persists anything
 */
export function approveTake(
  ctx: ShotDecisionContext,
  takeId: TakeId
): ShotDecisionContext {
  switch (ctx.state) {
    case 'UNDECIDED':
      return {
        ...ctx,
        state: 'GRACE',
        provisionalTakeId: takeId,
      };

    case 'GRACE':
      return {
        ...ctx,
        state: 'GRACE',
        provisionalTakeId: takeId,
      };

    case 'DECIDED':
      // Start new decision cycle.
      // approvedTakeId is cleared — the old decision
      // remains in decisionNotes as memory.
      return {
        ...ctx,
        state: 'GRACE',
        provisionalTakeId: takeId,
        approvedTakeId: null,
      };

    default:
      throw new InvalidTransitionError(
        `approveTake: unknown state '${(ctx as any).state}'`
      );
  }
}

/**
 * UndoApproval — Cancel provisional choice.
 *
 * Valid ONLY from GRACE.
 * Returns to UNDECIDED. Leaves no trace.
 *
 * "Undo may cancel intent. It may never erase memory."
 */
export function undoApproval(
  ctx: ShotDecisionContext
): ShotDecisionContext {
  if (ctx.state !== 'GRACE') {
    throw new InvalidTransitionError(
      `undoApproval: only allowed during GRACE, current state is '${ctx.state}'`
    );
  }

  return {
    ...ctx,
    state: 'UNDECIDED',
    provisionalTakeId: undefined,
  };
}

/**
 * LockDecision — Commit the editorial decision to memory.
 *
 * Valid ONLY from GRACE.
 * Transitions to DECIDED.
 *
 * This is the moment where memory is created:
 * - approvedTakeId is set
 * - a Decision Note is appended
 * - provisionalTakeId is cleared
 *
 * After this point, undo is forbidden.
 * The decision is permanent.
 *
 * @param ctx    - Current decision context (must be GRACE)
 * @param shotId - Shot identifier for the Decision Note
 * @param noteText - Editorial note explaining the decision
 * @param noteId - Unique identifier for the Decision Note
 * @param now    - Timestamp (injected for testability, no Date.now() inside)
 */
export function lockDecision(
  ctx: ShotDecisionContext,
  shotId: string,
  noteText: string,
  noteId: string,
  now: number
): ShotDecisionContext {
  if (ctx.state !== 'GRACE') {
    throw new InvalidTransitionError(
      `lockDecision: only allowed during GRACE, current state is '${ctx.state}'`
    );
  }

  if (!ctx.provisionalTakeId) {
    throw new ImpossibleStateError(
      'lockDecision: GRACE without provisionalTakeId'
    );
  }

  if (!noteText.trim()) {
    throw new InvalidTransitionError(
      'lockDecision: Decision Note text cannot be empty'
    );
  }

  const note: DecisionNote = {
    id: noteId,
    shotId,
    text: noteText,
    createdAt: now,
  };

  return {
    state: 'DECIDED',
    approvedTakeId: ctx.provisionalTakeId,
    provisionalTakeId: undefined,
    decisionNotes: [...ctx.decisionNotes, note],
  };
}
