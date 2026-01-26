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

// Type per form state
type FormState = {
  errors?: {
    title?: string[]
    logline?: string[]
    duration_minutes?: string[]
    status?: string[]
    _form?: string[]
  }
} | void

// Server Action
export async function createProjectAction(
  prevState: FormState,
  formData: FormData
): Promise<FormState> {
  console.log('🔵 Action called')
  console.log('📦 FormData:', {
    title: formData.get('title'),
    logline: formData.get('logline'),
    duration_minutes: formData.get('duration_minutes'),
    status: formData.get('status'),
  })

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

    console.log('💾 About to insert:', {
      title: validatedFields.data.title,
      logline: validatedFields.data.logline || null,
      duration_seconds: durationInSeconds,
      status: validatedFields.data.status,
    })

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
    
    // Altri errori → mostra in UI
    console.error('💥 Error creating project:', error)
    return {
      errors: {
        _form: ['Failed to create project'],
      },
    }
  }
}