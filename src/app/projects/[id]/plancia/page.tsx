import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
    ProjectPlanciaClient,
    type PlanciaProject,
} from '@/components/project/project-plancia-client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Props = {
    params: { id: string }
}

export default async function ProjectPlanciaPage({ params }: Props) {
    const { id: projectId } = params
    const supabase = await createClient()

    const { data: row, error } = await supabase
        .from('projects')
        .select('id, title, logline')
        .eq('id', projectId)
        .single()

    if (error || !row) notFound()

    const project: PlanciaProject = {
        id: row.id,
        title: row.title,
        logline: row.logline ?? null,
    }

    return (
        <ProjectPlanciaClient
            project={project}
            projectId={projectId}
        />
    )
}