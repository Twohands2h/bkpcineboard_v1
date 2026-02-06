'use server'

import { createProject, updateProject, deleteProject } from '@/lib/db/queries/projects'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

// ============================================
// SCHEMA VALIDAZIONE
// ============================================

const createProjectSchema = z.object({
    title: z.string().min(1, 'Title is required').max(100, 'Title too long'),
    logline: z.string().max(500, 'Logline too long').optional(),
    duration_minutes: z.coerce.number().positive().optional(),
    status: z.enum(['planning', 'production', 'complete']),
})

// ============================================
// TYPES
// ============================================

type FormState = {
    errors?: {
        title?: string[]
        logline?: string[]
        duration_minutes?: string[]
        status?: string[]
        _form?: string[]
    }
} | void

// ============================================
// CREATE PROJECT ACTION
// ============================================

export async function createProjectAction(
    prevState: FormState,
    formData: FormData
): Promise<FormState> {
    console.log('🔵 Create action called')

    const validatedFields = createProjectSchema.safeParse({
        title: formData.get('title'),
        logline: formData.get('logline'),
        duration_minutes: formData.get('duration_minutes'),
        status: formData.get('status'),
    })

    if (!validatedFields.success) {
        console.log('❌ Validation failed:', validatedFields.error)
        return {
            errors: validatedFields.error.flatten().fieldErrors,
        }
    }

    console.log('✅ Validation passed:', validatedFields.data)

    try {
        const durationInSeconds = validatedFields.data.duration_minutes
            ? validatedFields.data.duration_minutes * 60
            : null

        const project = await createProject({
            title: validatedFields.data.title,
            logline: validatedFields.data.logline || null,
            duration_seconds: durationInSeconds,
            status: validatedFields.data.status,
        })

        console.log('✅ Project created:', project.id)

        revalidatePath('/projects')
        redirect('/projects')
    } catch (error) {
        // Se è NEXT_REDIRECT, lascia che Next.js lo gestisca
        if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
            throw error
        }

        console.error('💥 Error creating project:', error)
        return {
            errors: {
                _form: ['Failed to create project'],
            },
        }
    }
}

// ============================================
// UPDATE PROJECT ACTION
// ============================================

export async function updateProjectAction(
    id: string,
    prevState: FormState,
    formData: FormData
): Promise<FormState> {
    console.log('🔵 Update action called for:', id)

    const validatedFields = createProjectSchema.safeParse({
        title: formData.get('title'),
        logline: formData.get('logline'),
        duration_minutes: formData.get('duration_minutes'),
        status: formData.get('status'),
    })

    if (!validatedFields.success) {
        console.log('❌ Validation failed:', validatedFields.error)
        return {
            errors: validatedFields.error.flatten().fieldErrors,
        }
    }

    console.log('✅ Validation passed:', validatedFields.data)

    try {
        const durationInSeconds = validatedFields.data.duration_minutes
            ? validatedFields.data.duration_minutes * 60
            : null

        await updateProject(id, {
            title: validatedFields.data.title,
            logline: validatedFields.data.logline || null,
            duration_seconds: durationInSeconds,
            status: validatedFields.data.status,
        })

        console.log('✅ Project updated:', id)

        revalidatePath('/projects')
        revalidatePath(`/projects/${id}`)
        redirect(`/projects/${id}`)
    } catch (error) {
        if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
            throw error
        }

        console.error('💥 Error updating project:', error)
        return {
            errors: {
                _form: ['Failed to update project'],
            },
        }
    }
}

// ============================================
// DELETE PROJECT ACTION
// ============================================

export async function deleteProjectAction(id: string): Promise<void> {
    console.log('🔵 Delete action called for:', id)

    try {
        await deleteProject(id)
        console.log('✅ Project deleted:', id)

        revalidatePath('/projects')
        redirect('/projects')
    } catch (error) {
        if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
            throw error
        }

        console.error('💥 Error deleting project:', error)
        throw new Error('Failed to delete project')
    }
}