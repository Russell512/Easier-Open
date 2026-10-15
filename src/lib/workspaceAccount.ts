import { createContext, useContext } from 'react'
import type { User } from '@supabase/supabase-js'

export interface WorkspaceAccount {
  user: User | null
  local: boolean
  status: string
  error: string
  busy: boolean
  ready: boolean
  conflict: boolean
  remoteChanged: boolean
  sync: () => Promise<void>
  backup: () => Promise<void>
  importBackup: () => void
  downloadExcel: () => Promise<void>
  signOut: () => Promise<void>
  loadCloud: () => Promise<void>
  keepLocal: () => Promise<void>
}

export const WorkspaceAccountContext = createContext<WorkspaceAccount | null>(null)
export const useWorkspaceAccount = () => useContext(WorkspaceAccountContext)
