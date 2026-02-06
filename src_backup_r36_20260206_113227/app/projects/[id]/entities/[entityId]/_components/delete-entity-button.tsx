'use client'

import { useState } from 'react'
import { deleteEntityAction } from '@/app/actions/entities'
import { Button } from '@/components/ui/button'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

type Props = {
    entityId: string
    projectId: string
    entityName: string
}

export function DeleteEntityButton({ entityId, projectId, entityName }: Props) {
    const [isDeleting, setIsDeleting] = useState(false)

    const handleDelete = async () => {
        setIsDeleting(true)
        try {
            await deleteEntityAction(entityId, projectId)
        } catch (error) {
            console.error('Delete failed:', error)
            setIsDeleting(false)
        }
    }

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={isDeleting}>
                    {isDeleting ? 'Deleting...' : 'Delete'}
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete Entity?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Are you sure you want to delete <strong>{entityName}</strong>? This
                        action cannot be undone. Any future @references to this entity will
                        break.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleDelete}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        Delete Entity
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}