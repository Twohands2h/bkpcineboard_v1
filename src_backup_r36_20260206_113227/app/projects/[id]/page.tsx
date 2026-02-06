import { redirect } from 'next/navigation'

type Props = {
  params: { id: string }
}

/**
 * Project Landing Page
 * 
 * Redirects to Boards as the default project view.
 * Project Settings accessible from Boards header.
 */
export default function ProjectDetailPage({ params }: Props) {
  redirect(`/projects/${params.id}/boards`)
}
