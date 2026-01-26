import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function ProjectNotFound() {
    return (
        <div className="container mx-auto py-20 px-4 text-center">
            <h1 className="text-4xl font-bold mb-4">Project Not Found</h1>
            <p className="text-muted-foreground mb-8">
                This project doesn't exist or has been deleted.
            </p>
            <Button asChild>
                <Link href="/projects">Back to Projects</Link>
            </Button>
        </div>
    )
}