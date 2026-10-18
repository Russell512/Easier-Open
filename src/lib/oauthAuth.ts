import { cloud } from './cloudClient'

export type OAuthProvider = 'apple' | 'google'
export type OAuthAvailability = Record<OAuthProvider, boolean>

export function oauthRedirectUrl(location: Pick<Location, 'origin' | 'pathname' | 'search'>): string {
  // Resolve against this origin, even for a pathname beginning with two slashes.
  const redirect = new URL(location.origin)
  redirect.pathname = location.pathname
  const share = new URLSearchParams(location.search).get('share')
  if (share && /^[a-f0-9]{48}$/.test(share)) redirect.searchParams.set('share', share)
  return redirect.href
}

let availability: Promise<OAuthAvailability> | undefined
export function readOAuthAvailability(): Promise<OAuthAvailability> {
  if (!cloud) return Promise.resolve({ apple: false, google: false })
  if (!availability) {
    // Auth's public settings endpoint contains provider flags, never credentials.
    availability = fetch(`${import.meta.env.VITE_SUPABASE_URL.replace(/\/$/, '')}/auth/v1/settings`, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(6000),
    }).then(async response => {
      if (!response.ok) throw new Error('無法確認登入方式')
      const settings: unknown = await response.json()
      if (!settings || typeof settings !== 'object' || !('external' in settings)) throw new Error('無法確認登入方式')
      const providers = settings.external
      if (!providers || typeof providers !== 'object' || !('apple' in providers) || !('google' in providers) || typeof providers.apple !== 'boolean' || typeof providers.google !== 'boolean') throw new Error('無法確認登入方式')
      return { apple: providers.apple, google: providers.google }
    }).catch(reason => { availability = undefined; throw reason })
  }
  return availability
}

export async function signInWithProvider(provider: OAuthProvider) {
  if (!cloud) throw new Error('此版本尚未連接雲端登入')
  const { error } = await cloud.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: oauthRedirectUrl(window.location),
      ...(provider === 'google' ? { queryParams: { prompt: 'select_account' } } : {}),
    },
  })
  if (error) throw error
}

export function oauthCallbackError(location: Pick<Location, 'hash' | 'search'>): string {
  const query = new URLSearchParams(location.search)
  const fragment = new URLSearchParams(location.hash.replace(/^#/, ''))
  const error = query.get('error') ?? fragment.get('error')
  const code = query.get('error_code') ?? fragment.get('error_code')
  if (!error && !code) return ''
  if (error === 'access_denied') return '登入未完成，請再試一次或選擇其他登入方式。'
  // Do not echo provider-controlled URLs or raw error descriptions into the UI.
  return '登入暫時無法完成，請再試一次或選擇其他登入方式。'
}
