import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import type { AccountGuard } from './accountSession'

export interface AccountCloud { userId: string; client: SupabaseClient; assert: () => void }

/** Every request retains this account's token, even if another tab changes auth. */
export function createAccountCloud(session: Session, guard: AccountGuard): AccountCloud {
  if (session.user.id !== guard.userId) throw new Error('登入帳號與工作區不符。')
  const client = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
    accessToken: async () => { guard.assert(); return session.access_token },
    global: { fetch: (input, init) => {
      guard.assert()
      return fetch(input, { ...init, signal: guard.signal })
    } },
  })
  return { userId: session.user.id, client, assert: guard.assert }
}
