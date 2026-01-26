'use server'

import { createProject } from '@/lib/db/queries/projects'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

// Schema validazione
const createProjectSchema = z.object({
    title: z.string().min(1, 'Title is required').max(100, 'Title too long'),
    logline: z.string().max(500, 'Logline too long').optional(),
    duration_minutes: z.coerce.number().positive().optional(),
    status: z.enum(['planning', 'production', 'complete']),
})

// Type per form state - AGGIUNTO void
type FormState = {
    errors?: {
        title?: string[]
        logline?: string[]
        duration_minutes?: string[]
        status?: string[]
        _form?: string[]
    }
} | void

// Server Action - MODIFICATO type prevState
export async function createProjectAction(
    prevState: FormState,
    formData: FormData
): Promise<FormState> {
    // Valida input
    const validatedFields = createProjectSchema.safeParse({
        title: formData.get('title'),
        logline: formData.get('logline'),
        duration_minutes: formData.get('duration_minutes'),
        status: formData.get('status'),
    })

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
        }
    }

    try {
        // Converti minuti → secondi
        const durationInSeconds = validatedFields.data.duration_minutes
            ? validatedFields.data.duration_minutes * 60
            : null

        const project = await createProject({
            title: validatedFields.data.title,
            logline: validatedFields.data.logline || null,
            duration_seconds: durationInSeconds,
            status: validatedFields.data.status,
        })

        revalidatePath('/projects')
        redirect('/projects')
    } catch (error) {
        console.error('Error creating project:', error)
        return {
            errors: {
                _form: ['Failed to create project'],
            },
        }
    }
}