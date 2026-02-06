'use client'

import { useFormState } from 'react-dom'
import { updateProjectAction } from '@/app/actions/projects'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import Link from 'next/link'
import { useState } from 'react'

type Props = {
    params: { id: string }
    searchParams: {
        title?: string
        logline?: string
        duration?: string
        status?: string
    }
}

export default function EditProjectPage({ params, searchParams }: Props) {
    const { id } = params

    // State per status controllato
    const [status, setStatus] = useState(searchParams.status || 'planning')

    // Converti duration da secondi a minuti
    const durationMinutes = searchParams.duration
        ? Math.floor(parseInt(searchParams.duration) / 60).toString()
        : ''

    const updateWithId = updateProjectAction.bind(null, id)
    const [state, formAction] = useFormState(updateWithId, undefined)

    return (
        <div className="container mx-auto py-10 px-4 max-w-2xl">
            <div className="mb-8">
                <Link
                    href={`/projects/${id}`}
                    className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block"
                >
                    ← Back to Project
                </Link>
                <h1 className="text-3xl font-bold mb-2">Edit Project</h1>
                <p className="text-muted-foreground">
                    Update your film project details
                </p>
            </div>

            <form action={formAction} className="space-y-6">
                {/* Title */}
                <div className="space-y-2">
                    <Label htmlFor="title">
                        Title <span className="text-destructive">*</span>
                    </Label>
                    <Input
                        id="title"
                        name="title"
                        defaultValue={searchParams.title}
                        placeholder="The Last Detective"
                        required
                        maxLength={100}
                    />
                    {state?.errors?.title && (
                        <p className="text-sm text-destructive">{state.errors.title[0]}</p>
                    )}
                </div>

                {/* Logline */}
                <div className="space-y-2">
                    <Label htmlFor="logline">Logline</Label>
                    <Textarea
                        id="logline"
                        name="logline"
                        defaultValue={searchParams.logline}
                        placeholder="A noir AI mystery short film..."
                        maxLength={500}
                        rows={3}
                    />
                    {state?.errors?.logline && (
                        <p className="text-sm text-destructive">{state.errors.logline[0]}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                        Brief description of your film
                    </p>
                </div>

                {/* Duration */}
                <div className="space-y-2">
                    <Label htmlFor="duration_minutes">Duration (minutes)</Label>
                    <Input
                        id="duration_minutes"
                        name="duration_minutes"
                        type="number"
                        defaultValue={durationMinutes}
                        placeholder="8"
                        min="1"
                    />
                    {state?.errors?.duration_minutes && (
                        <p className="text-sm text-destructive">
                            {state.errors.duration_minutes[0]}
                        </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                        Estimated film length
                    </p>
                </div>

                {/* Status - Controllato */}
                <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <input type="hidden" name="status" value={status} />
                    <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="planning">Planning</SelectItem>
                            <SelectItem value="production">Production</SelectItem>
                            <SelectItem value="complete">Complete</SelectItem>
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                        Current project lifecycle stage
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
                    <Button
                        type="button"
                        variant="outline"
                        asChild
                        className="flex-1"
                    >
                        <Link href={`/projects/${id}`}>Cancel</Link>
                    </Button>
                </div>
            </form>
        </div>
    )
}