// ============================================================
// SHOT DECISION — SERVER ACTIONS
// ============================================================
// Pattern: identical to src/app/actions/takes.ts
// These actions are the ONLY entry points for decision
// persistence from the UI layer.
// ============================================================

'use server'

import { revalidatePath } from 'next/cache'
import { persistDecision } from '@/infra/shotDecisionDbAdapter'

/**
 * Persist a locked decision.
 *
 * Called ONLY after:
 * 1. approveTake() → GRACE (RAM)
 * 2. lockDecision() → DECIDED (RAM)
 * 3. This action → DECIDED (DB)
 *
 * The UI must have already validated via the Domain layer
 * before calling this action.
 */
export async function persistDecisionAction(data: {
  projectId: string
  shotId: string
  approvedTakeId: string
  decisionNote: {
    id: string
    text: string
    createdAt: number
  }
}): Promise<void> {
  await persistDecision({
    shotId: data.shotId,
    projectId: data.projectId,
    approvedTakeId: data.approvedTakeId,
    decisionNote: data.decisionNote,
  })

  revalidatePath(`/projects/${data.projectId}/shots/${data.shotId}`)
}
