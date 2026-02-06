'use client'

import { useFormState } from 'react-dom'
import { updateEntityAction } from '@/app/actions/entities'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import Link from 'next/link'

type Props = {
    entityId: string
    projectId: string
    entity: {
        name: string
        description: string | null
        master_prompt: string | null
        type: string
        slug: string
    }
}

const TYPE_LABELS = {
    character: 'Character',
    environment: 'Environment',
    asset: 'Asset',
} as const

export function EditEntityForm({ entityId, projectId, entity }: Props) {
    const updateWithIds = updateEntityAction.bind(null, entityId, projectId)
    const [state, formAction] = useFormState(updateWithIds, undefined)

    return (
        <form action={formAction} className="space-y-6">
            {/* Type (immutable - display only) */}
            <div className="space-y-2">
                <Label>Entity Type</Label>
                <div className="p-3 border rounded-md bg-muted/50">
                    <span className="font-medium">
                        {TYPE_LABELS[entity.type as keyof typeof TYPE_LABELS] || entity.type}
                    </span>
                    <span className="text-sm text-muted-foreground ml-2">
                        (cannot be changed)
                    </span>
                </div>
            </div>

            {/* Slug (immutable - display only) */}
            <div className="space-y-2">
                <Label>Reference</Label>
                <div className="p-3 border rounded-md bg-muted/50">
                    <span className="font-mono">@{entity.slug}</span>
                    <span className="text-sm text-muted-foreground ml-2">
                        (stable reference)
                    </span>
                </div>
            </div>

            {/* Name */}
            <div className="space-y-2">
                <Label htmlFor="name">
                    Name <span className="text-destructive">*</span>
                </Label>
                <Input
                    id="name"
                    name="name"
                    defaultValue={entity.name}
                    required
                    maxLength={100}
                />
                {state?.errors?.name && (
                    <p className="text-sm text-destructive">{state.errors.name[0]}</p>
                )}
                <p className="text-xs text-muted-foreground">
                    Changing name does not affect the @reference
                </p>
            </div>

            {/* Description */}
            <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                    id="description"
                    name="description"
                    defaultValue={entity.description || ''}
                    maxLength={1000}
                    rows={3}
                />
                {state?.errors?.description && (
                    <p className="text-sm text-destructive">
                        {state.errors.description[0]}
                    </p>
                )}
            </div>

            {/* Master Prompt */}
            <div className="space-y-2">
                <Label htmlFor="master_prompt">Master Prompt</Label>
                <Textarea
                    id="master_prompt"
                    name="master_prompt"
                    defaultValue={entity.master_prompt || ''}
                    maxLength={5000}
                    rows={5}
                />
                {state?.errors?.master_prompt && (
                    <p className="text-sm text-destructive">
                        {state.errors.master_prompt[0]}
                    </p>
                )}
                <p className="text-xs text-muted-foreground">
                    The semantic memory that defines this entity across your film
                </p>
            </div>

            {/* Form-level errors */}
            {state?.errors?._form && (
                <div className="rounded-md bg-destructive/10 p-4">
                    <p className="text-sm text-destructive">{state.errors._form[0]}</p>
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-4">
                <Button type="submit" className="flex-1">
                    Save Changes
                </Button>
                <Button type="button" variant="outline" asChild className="flex-1">
                    <Link href={`/projects/${projectId}/entities/${entityId}`}>
                        Cancel
                    </Link>
                </Button>
            </div>
        </form>
    )
}