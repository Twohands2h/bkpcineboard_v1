'use server'

import {
    createEntity,
    updateEntity,
    deleteEntity,
    countEntitiesByProject,
} from '@/lib/db/queries/entities'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

// ============================================
// SCHEMA VALIDAZIONE
// ============================================

// Create schema: type required (immutable after creation)
const createEntitySchema = z.object({
    type: z.enum(['character', 'environment', 'asset']),
    name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
    description: z.string().max(1000, 'Description too long').optional(),
    master_prompt: z.string().max(5000, 'Master prompt too long').optional(),
})

// Update schema: NO type (immutable), NO project_id (context)
const updateEntitySchema = z.object({
    name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
    description: z.string().max(1000, 'Description too long').optional(),
    master_prompt: z.string().max(5000, 'Master prompt too long').optional(),
})

// ============================================
// TYPES
// ============================================

type FormState = {
    errors?: {
        type?: string[]
        name?: string[]
        description?: string[]
        master_prompt?: string[]
        _form?: string[]
    }
} | void

// ============================================
// CREATE ENTITY ACTION
// ============================================

export async function createEntityAction(
    projectId: string,
    prevState: FormState,
    formData: FormData
): Promise<FormState> {
    console.log('🔵 Create entity action called for project:', projectId)

    // Validate user input only (project_id is execution context, not form input)
    const validatedFields = createEntitySchema.safeParse({
        type: formData.get('type'),
        name: formData.get('name'),
        description: formData.get('description'),
        master_prompt: formData.get('master_prompt'),
    })

    if (!validatedFields.success) {
        console.log('❌ Validation failed:', validatedFields.error)
        return {
            errors: validatedFields.error.flatten().fieldErrors,
        }
    }

    console.log('✅ Validation passed:', validatedFields.data)

    try {
        // Check max 5 entities limit (beta constraint)
        const count = await countEntitiesByProject(projectId)
        if (count >= 5) {
            console.log('❌ Max entities reached:', count)
            return {
                errors: {
                    _form: ['Maximum 5 entities per project (beta limit)'],
                },
            }
        }

        // Create entity (slug auto-generated, type set here and immutable)
        const entity = await createEntity({
            project_id: projectId,
            type: validatedFields.data.type,
            name: validatedFields.data.name,
            description: validatedFields.data.description || null,
            master_prompt: validatedFields.data.master_prompt || null,
        })

        console.log('✅ Entity created:', entity.id, 'slug:', entity.slug)

        // Revalidate
        revalidatePath(`/projects/${projectId}/entities`)
        revalidatePath(`/projects/${projectId}`)

        // Redirect to entities list
        redirect(`/projects/${projectId}/entities`)
    } catch (error) {
        // Handle NEXT_REDIRECT
        if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
            throw error
        }

        console.error('💥 Error creating entity:', error)

        // Handle duplicate slug error
        if (error instanceof Error && error.message.includes('similar name')) {
            return {
                errors: {
                    name: ['An entity with a similar name already exists'],
                },
            }
        }

        return {
            errors: {
                _form: ['Failed to create entity'],
            },
        }
    }
}

// ============================================
// UPDATE ENTITY ACTION
// ============================================

export async function updateEntityAction(
    entityId: string,
    projectId: string,
    prevState: FormState,
    formData: FormData
): Promise<FormState> {
    console.log('🔵 Update entity action called for:', entityId)

    // Validate user input only
    // NOTE: type is IMMUTABLE (not included in update schema)
    // NOTE: slug is IMMUTABLE (handled in query layer)
    const validatedFields = updateEntitySchema.safeParse({
        name: formData.get('name'),
        description: formData.get('description'),
        master_prompt: formData.get('master_prompt'),
    })

    if (!validatedFields.success) {
        console.log('❌ Validation failed:', validatedFields.error)
        return {
            errors: validatedFields.error.flatten().fieldErrors,
        }
    }

    console.log('✅ Validation passed:', validatedFields.data)

    try {
        // Update entity (type and slug NOT updated - immutable)
        await updateEntity(entityId, {
            name: validatedFields.data.name,
            description: validatedFields.data.description || null,
            master_prompt: validatedFields.data.master_prompt || null,
        })

        console.log('✅ Entity updated:', entityId)

        // Revalidate
        revalidatePath(`/projects/${projectId}/entities`)
        revalidatePath(`/projects/${projectId}/entities/${entityId}`)
        revalidatePath(`/projects/${projectId}`)

        // Redirect to entity detail
        redirect(`/projects/${projectId}/entities/${entityId}`)
    } catch (error) {
        if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
            throw error
        }

        console.error('💥 Error updating entity:', error)
        return {
            errors: {
                _form: ['Failed to update entity'],
            },
        }
    }
}

// ============================================
// DELETE ENTITY ACTION
// ============================================

export async function deleteEntityAction(
    entityId: string,
    projectId: string
): Promise<void> {
    console.log('🔵 Delete entity action called for:', entityId)

    try {
        await deleteEntity(entityId)
        console.log('✅ Entity deleted:', entityId)

        // Revalidate
        revalidatePath(`/projects/${projectId}/entities`)
        revalidatePath(`/projects/${projectId}`)

        // Redirect to entities list
        redirect(`/projects/${projectId}/entities`)
    } catch (error) {
        if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
            throw error
        }

        console.error('💥 Error deleting entity:', error)
        throw new Error('Failed to delete entity')
    }
}