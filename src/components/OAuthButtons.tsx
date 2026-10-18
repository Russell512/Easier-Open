import { useEffect, useId, useState } from 'react'
import { readOAuthAvailability, type OAuthAvailability, type OAuthProvider } from '../lib/oauthAuth'

export function OAuthProviderLogo({ provider }: { provider: OAuthProvider }) {
  return provider === 'apple' ? <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.75 3.08.81 1.18-.24 2.31-.94 3.57-.85 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01ZM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25Z" /></svg> : <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
}

export function OAuthButtons({ busy, onSignIn, compact = false }: { busy: boolean; onSignIn: (provider: OAuthProvider) => void; compact?: boolean }) {
  const [providers, setProviders] = useState<OAuthAvailability | null>(null)
  const [failed, setFailed] = useState(false)
  const hintId = useId()
  useEffect(() => {
    let cancelled = false
    void readOAuthAvailability().then(value => { if (!cancelled) setProviders(value) }).catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [])
  const hint = providers?.apple === false ? 'Apple 登入尚未啟用' : failed ? '暫時無法確認 Apple 登入，請稍後重新整理。' : !providers ? '正在確認登入方式…' : ''
  return <div className={`cloud-oauth${compact ? ' cloud-oauth-compact' : ''}`}>
    <div className="cloud-oauth-buttons">
      <button type="button" className="cloud-provider cloud-provider-apple" disabled={busy || providers?.apple !== true} aria-describedby={hint ? hintId : undefined} onClick={() => onSignIn('apple')}><OAuthProviderLogo provider="apple" /><span>使用 Apple 登入</span></button>
      <button type="button" className="cloud-provider cloud-provider-google" disabled={busy || providers?.google === false} onClick={() => onSignIn('google')}><OAuthProviderLogo provider="google" /><span>使用 Google 登入</span></button>
    </div>
    <p className="cloud-provider-hint" id={hintId} role="status">{hint || '\u00a0'}</p>
  </div>
}
