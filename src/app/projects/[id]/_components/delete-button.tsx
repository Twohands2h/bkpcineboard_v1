'use client'

import { useState } from 'react'
import { deleteProjectAction } from '@/app/actions/projects'
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
    projectId: string
    projectTitle: string
}

export function DeleteButton({ projectId, projectTitle }: Props) {
    const [isDeleting, setIsDeleting] = useState(false)

    const handleDelete = async () => {
        setIsDeleting(true)
        try {
            await deleteProjectAction(projectId)
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
                    <AlertDialogTitle>Delete Project?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Are you sure you want to delete <strong>{projectTitle}</strong>?
                        This action cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleDelete}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        Delete Project
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}