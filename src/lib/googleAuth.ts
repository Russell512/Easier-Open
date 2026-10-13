import { cloud } from './cloudClient'

export async function signInWithGoogle() {
  if (!cloud) throw new Error('此版本尚未連接雲端登入')
  const redirect = new URL(window.location.pathname, window.location.origin)
  // Preserve only the share route; never forward an arbitrary redirect URL.
  const share = new URLSearchParams(window.location.search).get('share')
  if (share && /^[a-f0-9]{48}$/.test(share)) redirect.searchParams.set('share', share)
  const { error } = await cloud.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirect.href, queryParams: { prompt: 'select_account' } } })
  if (error) throw error
}
