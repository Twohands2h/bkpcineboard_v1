import { ReactNode } from 'react'

// ===================================================
// SHOT WORKSPACE LAYOUT — SHELL MINIMALE (R3.3)
// ===================================================

type Props = {
  children: ReactNode
  params: {
    id: string      // projectId
    shotId: string
  }
}

export default function ShotWorkspaceLayout({ children }: Props) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {children}
    </div>
  )
}