// ============================================================
// SHOT DECISION — DOMAIN ERRORS
// ============================================================
// Status: CANONICAL / NON-INTERPRETABLE
// Source of truth: SHOT_DECISION_STATE_MACHINE.md §7
// ============================================================
// These are not "edge cases". They are bugs.
// If detected → hard fail, not graceful handling.
// ============================================================

/**
 * Base error for all Shot Decision domain violations.
 */
export class ShotDecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShotDecisionError';
  }
}

/**
 * Thrown when a state transition is attempted that violates
 * the canonical state machine.
 *
 * Examples:
 * - Undo after DECIDED
 * - Lock outside GRACE
 */
export class InvalidTransitionError extends ShotDecisionError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTransitionError';
  }
}

/**
 * Thrown when an invariant violation is detected.
 * These conditions must never occur (State Machine §7):
 *
 * - multiple approved takes
 * - Decision Note without DECIDED state
 * - DECIDED without Decision Notes
 * - GRACE without provisionalTakeId
 * - UNDECIDED with approvedTakeId
 *
 * If detected → bug, not edge case.
 */
export class ImpossibleStateError extends ShotDecisionError {
  constructor(message: string) {
    super(message);
    this.name = 'ImpossibleStateError';
  }
}
