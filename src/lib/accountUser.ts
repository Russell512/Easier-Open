import type { User } from '@supabase/supabase-js'
import { cloud } from './cloudClient'
import { createAccountCloud } from './accountCloud'
import { currentAccountGuard } from './accountSession'

type AccountUserUpdate = { data?: Record<string, unknown>; password?: string }

/** Keep profile/password requests attached to the account that opened the form. */
export async function captureAccountUser(userId: string) {
  const guard = currentAccountGuard()
  if (!cloud || !guard || guard.userId !== userId) throw new Error('請重新登入後再修改帳號設定。')
  guard.assert()
  const { data, error } = await cloud.auth.getSession()
  guard.assert()
  const session = data.session
  if (error || !session || session.user.id !== userId) throw new Error('登入帳號已變更，請重新開啟設定。')
  const scope = createAccountCloud(session, guard)
  return {
    ...scope,
    async update(attributes: AccountUserUpdate): Promise<User> {
      guard.assert()
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
        method: 'PUT', signal: guard.signal,
        headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(attributes),
      })
      guard.assert()
      if (!response.ok) throw new Error('帳號設定未更新，請重新登入後再試。')
      const user = await response.json() as User
      guard.assert()
      if (user.id !== userId) throw new Error('帳號回應不符，已停止更新。')
      window.dispatchEvent(new CustomEvent('easier-account-profile-updated', { detail: user }))
      return user
    },
  }
}

export async function updateAccountUser(userId: string, attributes: AccountUserUpdate): Promise<User> {
  return (await captureAccountUser(userId)).update(attributes)
}
