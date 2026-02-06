import { createClient } from '@/lib/supabase/server'
import { Database } from '@/lib/db/schema'

type Project = Database['public']['Tables']['projects']['Row']

/**
 * Get project by ID
 * Usato dal layout per risoluzione canonica del Project
 */
export async function getProject(projectId: string): Promise<Project | null> {
  console.log('🔍 getProject called with ID:', projectId)

  const supabase = await createClient()
  console.log('✅ Supabase client created')

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single()

  console.log('📊 Query result:', {
    found: !!data,
    error: error?.message,
    errorCode: error?.code,
    data: data
  })

  if (error) {
    if (error.code === 'PGRST116') {
      console.log('❌ Project not found in DB')
      return null
    }
    console.error('🚨 Supabase error:', error)
    throw new Error(`Failed to fetch project: ${error.message}`)
  }

  console.log('✅ Project found:', data?.id)
  return data
}

/**
 * List all projects for current user
 */
export async function listProjects(): Promise<Project[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to list projects: ${error.message}`)
  }

  return data ?? []
}