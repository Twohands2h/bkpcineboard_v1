'use client'

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import { deleteEntityAction } from '@/app/actions/entities'

interface DeleteEntityButtonProps {
    entityId: string
    projectId: string
}

export function DeleteEntityButton({ entityId, projectId }: DeleteEntityButtonProps) {
    const [isPending, startTransition] = useTransition()

    const handleDelete = () => {
        if (!confirm('Are you sure you want to delete this entity?')) return

        startTransition(async () => {
            try {
                await deleteEntityAction(entityId, projectId)
            } catch (error) {
                // NEXT_REDIRECT throws an error, which is expected
            }
        })
    }

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={isPending}
            className="text-destructive hover:text-destructive"
        >
            <Trash2 className="w-4 h-4 mr-2" />
            {isPending ? 'Deleting...' : 'Delete'}
        </Button>
    )
}