// ============================================================
// SHOT DECISION — DB ADAPTER
// ============================================================
// Status: CANONICAL / INFRASTRUCTURE INVISIBLE
// Principle: GRACE is transient. The database must not know
//            it exists.
// ============================================================
// The Domain decides. The Infra remembers.
// The Infra never decides.
// ============================================================

import type {
  ShotDecisionContext,
  DecisionNote,
} from '@/domain/shot-decision/shotDecisionTypes'

import { ImpossibleStateError } from '@/domain/shot-decision/shotDecisionErrors'

import {
  getShotApprovedTakeId,
  listShotDecisionNotes,
  persistShotDecision,
} from '@/lib/db/queries/shot-decisions'

// ─── Types ───────────────────────────────────────────────────

/**
 * Parameters for persisting a decision.
 *
 * NOTE: This does NOT accept ShotDecisionContext.
 * The Adapter receives only the data it needs to write.
 * It never sees GRACE. It never interprets state.
 */
export type PersistDecisionParams = {
  shotId: string
  projectId: string
  approvedTakeId: string
  decisionNote: {
    id: string
    text: string
    createdAt: number // epoch ms
  }
}

// ─── WRITE ───────────────────────────────────────────────────

/**
 * Persist a DECIDED state to the database.
 *
 * Preconditions (enforced by Domain, not checked here):
 * - State was GRACE
 * - lockDecision() was called
 * - noteText is non-empty
 *
 * This function:
 * - Updates shots.approved_take_id
 * - Inserts a decision_note
 * - Atomically (both succeed or both fail)
 *
 * This function does NOT:
 * - Accept ShotDecisionContext
 * - Validate state transitions
 * - Handle GRACE
 * - Catch errors silently
 */
export async function persistDecision(
  params: PersistDecisionParams
): Promise<void> {
  await persistShotDecision({
    shotId: params.shotId,
    projectId: params.projectId,
    approvedTakeId: params.approvedTakeId,
    note: {
      id: params.decisionNote.id,
      text: params.decisionNote.text,
      createdAt: new Date(params.decisionNote.createdAt).toISOString(),
    },
  })
}

// ─── READ ────────────────────────────────────────────────────

/**
 * Load the decision state for a Shot from the database.
 *
 * Returns a ShotDecisionContext that is ALWAYS either:
 * - UNDECIDED (no approved take)
 * - DECIDED (approved take + notes)
 *
 * NEVER returns GRACE. A reload always clears provisional state.
 * This is by Constitution, not by accident.
 *
 * Hard fails on impossible states:
 * - approved_take_id set but zero decision notes
 */
export async function loadShotDecision(
  shotId: string
): Promise<ShotDecisionContext> {
  const approvedTakeId = await getShotApprovedTakeId(shotId)

  // Case 1: UNDECIDED
  if (!approvedTakeId) {
    return {
      state: 'UNDECIDED',
      approvedTakeId: null,
      decisionNotes: [],
    }
  }

  // Case 2: Has approved take → load notes
  const noteRows = await listShotDecisionNotes(shotId)

  // Impossible state check: approved take but no notes
  if (noteRows.length === 0) {
    throw new ImpossibleStateError(
      `Shot ${shotId} has approved_take_id but zero decision notes. ` +
      `This is a data integrity violation.`
    )
  }

  // Map DB rows to domain DecisionNote
  const decisionNotes: DecisionNote[] = noteRows.map(row => ({
    id: row.id,
    shotId: row.parent_id,
    text: row.body,
    createdAt: new Date(row.created_at).getTime(),
  }))

  return {
    state: 'DECIDED',
    approvedTakeId,
    decisionNotes,
  }
}
