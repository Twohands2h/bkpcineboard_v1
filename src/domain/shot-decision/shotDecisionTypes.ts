// ============================================================
// SHOT DECISION — CANONICAL TYPES
// ============================================================
// Status: CANONICAL / NON-INTERPRETABLE
// Source of truth: SHOT_DECISION_STATE_MACHINE.md
// Constitution test: "Does this preserve the film's memory?"
// ============================================================
// This file encodes editorial decisions.
// Do not refactor for convenience.
// ============================================================

/**
 * The only valid states for a Shot's editorial decision.
 *
 * UNDECIDED — No editorial decision exists.
 * GRACE    — A provisional decision exists, but it is not yet memory.
 *            This state is transient and non-persistent.
 * DECIDED  — An editorial decision has been made and recorded.
 *            This is memory, not preference.
 *
 * No other states are permitted.
 */
export type ShotDecisionState = 'UNDECIDED' | 'GRACE' | 'DECIDED';

/**
 * Opaque identifier for a Take.
 */
export type TakeId = string;

/**
 * A Decision Note is an immutable, append-only editorial record.
 *
 * Properties:
 * - append-only
 * - immutable
 * - chronological
 * - editorial in tone
 *
 * There is no edit. No delete. No overwrite. No "fix later".
 */
export interface DecisionNote {
  readonly id: string;
  readonly shotId: string;
  readonly text: string;
  readonly createdAt: number;
}

/**
 * The complete decision context for a Shot.
 *
 * Persistence rules (from State Machine §6):
 *
 * PERSISTED:
 * - approvedTakeId (DECIDED only)
 * - decisionNotes
 *
 * NOT PERSISTED:
 * - GRACE state
 * - provisionalTakeId
 * - countdown timers
 * - hesitation
 *
 * Persistence begins only at DECIDED.
 */
export interface ShotDecisionContext {
  readonly state: ShotDecisionState;

  // --- Persisted (DECIDED only) ---
  readonly approvedTakeId: TakeId | null;
  readonly decisionNotes: readonly DecisionNote[];

  // --- Ephemeral (never persisted) ---
  readonly provisionalTakeId?: TakeId;
}
