'use client'

import { useFormState } from 'react-dom'
import { createEntityAction } from '@/app/actions/entities'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import Link from 'next/link'
import { useState } from 'react'

type Props = {
    params: { id: string }
}

const ENTITY_TYPES = [
    {
        value: 'character',
        label: 'Character',
        description: 'People, creatures, animated beings',
    },
    {
        value: 'environment',
        label: 'Environment',
        description: 'Locations, settings, spaces',
    },
    {
        value: 'asset',
        label: 'Asset',
        description: 'Props, vehicles, objects, FX',
    },
] as const

export default function NewEntityPage({ params }: Props) {
    const { id: projectId } = params
    const [selectedType, setSelectedType] = useState<string>('character')

    const createWithProjectId = createEntityAction.bind(null, projectId)
    const [state, formAction] = useFormState(createWithProjectId, undefined)

    return (
        <div className="container mx-auto py-10 px-4 max-w-2xl">
            <div className="mb-8">
                <Link
                    href={`/projects/${projectId}/entities`}
                    className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block"
                >
                    ← Back to Project Memory
                </Link>
                <h1 className="text-3xl font-bold mb-2">Add Entity</h1>
                <p className="text-muted-foreground">
                    Create a new entity for your film's memory
                </p>
            </div>

            <form action={formAction} className="space-y-6">
                {/* Type Selection (immutable after creation) */}
                <div className="space-y-3">
                    <Label>
                        Entity Type <span className="text-destructive">*</span>
                    </Label>
                    <input type="hidden" name="type" value={selectedType} />
                    <div className="grid grid-cols-3 gap-3">
                        {ENTITY_TYPES.map((type) => (
                            <button
                                key={type.value}
                                type="button"
                                onClick={() => setSelectedType(type.value)}
                                className={`p-4 border rounded-lg text-left transition-colors ${selectedType === type.value
                                        ? 'border-primary bg-primary/5'
                                        : 'hover:border-muted-foreground/50'
                                    }`}
                            >
                                <div className="font-medium">{type.label}</div>
                                <div className="text-xs text-muted-foreground">
                                    {type.description}
                                </div>
                            </button>
                        ))}
                    </div>
                    {state?.errors?.type && (
                        <p className="text-sm text-destructive">{state.errors.type[0]}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                        Type cannot be changed after creation
                    </p>
                </div>

                {/* Name */}
                <div className="space-y-2">
                    <Label htmlFor="name">
                        Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                        id="name"
                        name="name"
                        placeholder="John Detective"
                        required
                        maxLength={100}
                    />
                    {state?.errors?.name && (
                        <p className="text-sm text-destructive">{state.errors.name[0]}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                        A unique reference (@slug) will be generated from this name
                    </p>
                </div>

                {/* Description */}
                <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                        id="description"
                        name="description"
                        placeholder="Brief description of this entity..."
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
                        placeholder="Core visual and narrative description for AI consistency..."
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
                        Create Entity
                    </Button>
                    <Button type="button" variant="outline" asChild className="flex-1">
                        <Link href={`/projects/${projectId}/entities`}>Cancel</Link>
                    </Button>
                </div>
            </form>
        </div>
    )
}