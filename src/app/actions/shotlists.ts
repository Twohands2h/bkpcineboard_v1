'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
    createShotlist,
    updateShotlist,
    deleteShotlist,
    getOrCreateShotlist,
} from '@/lib/db/queries/shotlists'

// ============================================
// CREATE
// ============================================

export async function createShotlistAction(
    projectId: string,
    formData?: FormData
): Promise<{ id: string }> {
    const title = formData?.get('title') as string | undefined
    const description = formData?.get('description') as string | undefined

    const shotlist = await createShotlist(projectId, {
        title: title || undefined,
        description: description || undefined,
    })

    revalidatePath(`/projects/${projectId}`)
    revalidatePath(`/projects/${projectId}/shotlist`)

    return { id: shotlist.id }
}

// ============================================
// GET OR CREATE (for UI convenience)
// ============================================

export async function getOrCreateShotlistAction(
    projectId: string
): Promise<{ id: string }> {
    const shotlist = await getOrCreateShotlist(projectId)

    return { id: shotlist.id }
}

// ============================================
// UPDATE
// ============================================

export async function updateShotlistAction(
    id: string,
    projectId: string,
    formData: FormData
): Promise<void> {
    const title = formData.get('title') as string | undefined
    const description = formData.get('description') as string | undefined

    await updateShotlist(id, {
        title: title || undefined,
        description: description || undefined,
    })

    revalidatePath(`/projects/${projectId}`)
    revalidatePath(`/projects/${projectId}/shotlist`)
}

// ============================================
// DELETE (with redirect)
// ============================================

export async function deleteShotlistAction(
    id: string,
    projectId: string
): Promise<void> {
    await deleteShotlist(id)

    revalidatePath(`/projects/${projectId}`)
    redirect(`/projects/${projectId}`)
}