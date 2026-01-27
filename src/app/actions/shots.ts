'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
    createShot,
    updateShot,
    deleteShot,
    reorderShots,
} from '@/lib/db/queries/shots'
import { EntityReference, ShotStatus } from '@/lib/db/queries/shots'

// ============================================
// CREATE
// ============================================

export async function createShotAction(
    shotlistId: string,
    projectId: string,
    formData: FormData
): Promise<{ id: string }> {
    const shot_number = formData.get('shot_number') as string
    const title = formData.get('title') as string | undefined
    const description = formData.get('description') as string | undefined
    const shot_type = formData.get('shot_type') as string | undefined
    const status = formData.get('status') as ShotStatus | undefined

    // Parse entity_references from JSON string if provided
    const entityRefsString = formData.get('entity_references') as string | undefined
    let entity_references: EntityReference[] | undefined
    if (entityRefsString) {
        try {
            entity_references = JSON.parse(entityRefsString)
        } catch {
            entity_references = undefined
        }
    }

    const shot = await createShot(shotlistId, {
        shot_number,
        title: title || undefined,
        description: description || undefined,
        shot_type: shot_type || undefined,
        entity_references,
        status: status || undefined,
    })

    revalidatePath(`/projects/${projectId}/shotlist`)

    return { id: shot.id }
}

// ============================================
// UPDATE
// ============================================

export async function updateShotAction(
    id: string,
    projectId: string,
    formData: FormData
): Promise<void> {
    const shot_number = formData.get('shot_number') as string | undefined
    const title = formData.get('title') as string | undefined
    const description = formData.get('description') as string | undefined
    const shot_type = formData.get('shot_type') as string | undefined
    const status = formData.get('status') as ShotStatus | undefined

    // Parse entity_references from JSON string if provided
    const entityRefsString = formData.get('entity_references') as string | undefined
    let entity_references: EntityReference[] | undefined
    if (entityRefsString) {
        try {
            entity_references = JSON.parse(entityRefsString)
        } catch {
            entity_references = undefined
        }
    }

    await updateShot(id, {
        shot_number: shot_number || undefined,
        title: title || undefined,
        description: description || undefined,
        shot_type: shot_type || undefined,
        entity_references,
        status: status || undefined,
    })

    revalidatePath(`/projects/${projectId}/shotlist`)
}

// ============================================
// UPDATE STATUS (convenience action)
// ============================================

export async function updateShotStatusAction(
    id: string,
    projectId: string,
    status: ShotStatus
): Promise<void> {
    await updateShot(id, { status })

    revalidatePath(`/projects/${projectId}/shotlist`)
}

// ============================================
// REORDER
// ============================================

export async function reorderShotsAction(
    projectId: string,
    updates: Array<{ id: string; order_index: number }>
): Promise<void> {
    await reorderShots(updates)

    revalidatePath(`/projects/${projectId}/shotlist`)
}

// ============================================
// DELETE
// ============================================

export async function deleteShotAction(
    id: string,
    projectId: string
): Promise<void> {
    await deleteShot(id)

    revalidatePath(`/projects/${projectId}/shotlist`)
}

// ============================================
// DELETE WITH REDIRECT (from detail page)
// ============================================

export async function deleteShotWithRedirectAction(
    id: string,
    projectId: string
): Promise<void> {
    await deleteShot(id)

    revalidatePath(`/projects/${projectId}/shotlist`)
    redirect(`/projects/${projectId}/shotlist`)
}