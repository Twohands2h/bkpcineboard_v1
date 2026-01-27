'use client'

import { useRouter } from 'next/navigation'
import { useTransition, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { createShotAction, updateShotAction } from '@/app/actions/shots'
import { Database } from '@/lib/db/schema'
import { X } from 'lucide-react'

type Shot = Database['public']['Tables']['shots']['Row']
type Entity = Database['public']['Tables']['entities']['Row']

interface EntityReference {
    slug: string
    role?: string
    context_note?: string
}

interface ShotFormProps {
    projectId: string
    shotlistId: string
    shot?: Shot
    entities: Entity[]
}

const STATUS_OPTIONS = [
    { value: 'planning', label: 'Planning' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'review', label: 'Review' },
    { value: 'done', label: 'Done' },
]

export function ShotForm({
    projectId,
    shotlistId,
    shot,
    entities,
}: ShotFormProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const isEditing = !!shot

    const initialRefs = shot
        ? (shot.entity_references as unknown as EntityReference[]) || []
        : []

    const [entityRefs, setEntityRefs] = useState<EntityReference[]>(initialRefs)
    const [selectedEntity, setSelectedEntity] = useState<string>('')

    const addEntityRef = () => {
        if (!selectedEntity) return
        if (entityRefs.some((ref) => ref.slug === selectedEntity)) return

        setEntityRefs([...entityRefs, { slug: selectedEntity }])
        setSelectedEntity('')
    }

    const removeEntityRef = (slug: string) => {
        setEntityRefs(entityRefs.filter((ref) => ref.slug !== slug))
    }

    const updateEntityRef = (
        slug: string,
        field: 'role' | 'context_note',
        value: string
    ) => {
        setEntityRefs(
            entityRefs.map((ref) =>
                ref.slug === slug ? { ...ref, [field]: value || undefined } : ref
            )
        )
    }

    async function handleSubmit(formData: FormData) {
        formData.set('entity_references', JSON.stringify(entityRefs))

        startTransition(async () => {
            try {
                if (isEditing) {
                    await updateShotAction(shot.id, projectId, formData)
                    router.push(`/projects/${projectId}/shotlist/${shot.id}`)
                } else {
                    const result = await createShotAction(shotlistId, projectId, formData)
                    router.push(`/projects/${projectId}/shotlist/${result.id}`)
                }
            } catch (error) {
                console.error('Failed to save shot:', error)
            }
        })
    }

    return (
        <form action={handleSubmit} className="space-y-6">
            {/* Shot Number */}
            <div className="space-y-2">
                <Label htmlFor="shot_number">Shot Number *</Label>
                <Input
                    id="shot_number"
                    name="shot_number"
                    defaultValue={shot?.shot_number || '1.1'}
                    placeholder="e.g., 1.1, 2.3"
                    required
                    className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                    Human-readable identifier (e.g., Scene.Shot)
                </p>
            </div>

            {/* Title */}
            <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                    id="title"
                    name="title"
                    defaultValue={shot?.title || ''}
                    placeholder="e.g., Detective enters warehouse"
                />
            </div>

            {/* Shot Type - Free text with suggestions */}
            <div className="space-y-2">
                <Label htmlFor="shot_type">Shot Type</Label>
                <Input
                    id="shot_type"
                    name="shot_type"
                    defaultValue={shot?.shot_type || ''}
                    placeholder="e.g., WIDE, CLOSE-UP, TRACKING"
                    list="shot-type-suggestions"
                />
                <datalist id="shot-type-suggestions">
                    <option value="WIDE" />
                    <option value="MEDIUM" />
                    <option value="CLOSE-UP" />
                    <option value="EXTREME CLOSE-UP" />
                    <option value="INSERT" />
                    <option value="POV" />
                    <option value="OVER THE SHOULDER" />
                    <option value="TWO SHOT" />
                    <option value="TRACKING" />
                    <option value="DRONE" />
                </datalist>
                <p className="text-xs text-muted-foreground">
                    Free text. Common types: WIDE, MEDIUM, CLOSE-UP, INSERT, POV, TRACKING
                </p>
            </div>

            {/* Status */}
            <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select name="status" defaultValue={shot?.status || 'planning'}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {STATUS_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Description */}
            <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                    id="description"
                    name="description"
                    defaultValue={shot?.description || ''}
                    placeholder="What happens in this shot? Describe the action, mood, and visual intent."
                    rows={4}
                />
            </div>

            {/* Entity References */}
            <div className="space-y-4">
                <Label>Entity References</Label>
                <p className="text-xs text-muted-foreground">
                    Link entities that appear in this shot with optional narrative context.
                </p>

                {/* Add Entity */}
                {entities.length > 0 && (
                    <div className="flex gap-2">
                        <Select value={selectedEntity} onValueChange={setSelectedEntity}>
                            <SelectTrigger className="flex-1">
                                <SelectValue placeholder="Select entity to add" />
                            </SelectTrigger>
                            <SelectContent>
                                {entities
                                    .filter((e) => !entityRefs.some((ref) => ref.slug === e.slug))
                                    .map((entity) => (
                                        <SelectItem key={entity.id} value={entity.slug}>
                                            @{entity.slug} ({entity.type})
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                        <Button type="button" variant="outline" onClick={addEntityRef}>
                            Add
                        </Button>
                    </div>
                )}

                {/* Entity List */}
                {entityRefs.length > 0 && (
                    <div className="space-y-3">
                        {entityRefs.map((ref) => (
                            <div key={ref.slug} className="border rounded-lg p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="font-semibold text-primary">@{ref.slug}</span>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removeEntityRef(ref.slug)}
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <Label className="text-xs">Role (optional)</Label>
                                        <Input
                                            value={ref.role || ''}
                                            onChange={(e) =>
                                                updateEntityRef(ref.slug, 'role', e.target.value)
                                            }
                                            placeholder="e.g., protagonist"
                                            className="mt-1"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-xs">Context Note (optional)</Label>
                                        <Input
                                            value={ref.context_note || ''}
                                            onChange={(e) =>
                                                updateEntityRef(ref.slug, 'context_note', e.target.value)
                                            }
                                            placeholder="e.g., first appearance"
                                            className="mt-1"
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {entities.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">
                        No entities in this project yet.{' '}
                        <Link
                            href={`/projects/${projectId}/entities/new`}
                            className="text-primary hover:underline"
                        >
                            Create one first
                        </Link>
                        .
                    </p>
                )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
                <Button type="submit" disabled={isPending}>
                    {isPending ? 'Saving...' : isEditing ? 'Update Shot' : 'Create Shot'}
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.back()}
                    disabled={isPending}
                >
                    Cancel
                </Button>
            </div>
        </form>
    )
}