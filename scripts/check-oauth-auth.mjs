import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { build } from 'esbuild'

await fs.mkdir('.local', { recursive: true })
const calls = []
let authError = null
globalThis.__oauthTestCloud = { auth: { signInWithOAuth: async value => { calls.push(value); return { error: authError } } } }
await build({
  entryPoints: ['src/lib/oauthAuth.ts'], bundle: true, platform: 'node', format: 'esm', outfile: '.local/oauth-auth-test.mjs',
  define: { 'import.meta.env.VITE_SUPABASE_URL': '"https://auth.example.test/"', 'import.meta.env.VITE_SUPABASE_ANON_KEY': '"public-test-key"' },
  plugins: [{ name: 'mock-auth-client', setup(build) {
    build.onResolve({ filter: /^\.\/cloudClient$/ }, () => ({ path: 'cloudClient', namespace: 'test' }))
    build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const cloud = globalThis.__oauthTestCloud', loader: 'js' }))
  } }],
})
const api = await import('../.local/oauth-auth-test.mjs')
const token = 'a'.repeat(48)
globalThis.window = { location: { origin: 'https://easier.example', pathname: '/', search: `?share=${token}&redirect=https://evil.example` } }
await api.signInWithProvider('apple')
assert.deepEqual(calls[0], { provider: 'apple', options: { redirectTo: `https://easier.example/?share=${token}` } })
await api.signInWithProvider('google')
assert.deepEqual(calls[1], { provider: 'google', options: { redirectTo: `https://easier.example/?share=${token}`, queryParams: { prompt: 'select_account' } } })
for (const search of ['?share=../../workspace', `?share=${'a'.repeat(47)}`, '?redirect=https://evil.example', '?share=%E0%A4%A']) {
  assert.equal(api.oauthRedirectUrl({ origin: 'https://easier.example', pathname: '/app', search }), 'https://easier.example/app')
}
const trickyPath = new URL(api.oauthRedirectUrl({ origin: 'https://easier.example', pathname: '//evil.example/path', search: '' }))
assert.equal(trickyPath.origin, 'https://easier.example', 'protocol-relative paths must stay on this origin')
assert.equal(api.oauthCallbackError({ search: '?error=access_denied&error_description=https://evil.example', hash: '' }), '登入未完成，請再試一次或選擇其他登入方式。')
assert.equal(api.oauthCallbackError({ search: '', hash: '#error_code=unexpected_failure&error_description=%E0%A4%A' }), '登入暫時無法完成，請再試一次或選擇其他登入方式。')
assert.equal(api.oauthCallbackError({ search: `?share=${token}`, hash: '#access_token=example' }), '')
authError = new Error('Provider refused request')
await assert.rejects(api.signInWithProvider('apple'), /Provider refused request/)
let requests = 0
let response = { ok: false }
globalThis.fetch = async (url, options) => {
  requests++
  assert.equal(url, 'https://auth.example.test/auth/v1/settings')
  assert.equal(options.headers.apikey, 'public-test-key')
  return response
}
await assert.rejects(api.readOAuthAvailability(), /無法確認登入方式/)
response = { ok: true, json: async () => ({ external: { apple: 'false', google: true } }) }
await assert.rejects(api.readOAuthAvailability(), /無法確認登入方式/, 'malformed settings must not enable Apple')
response = { ok: true, json: async () => ({ external: { apple: false, google: true }, unrelated: 'ignored' }) }
assert.deepEqual(await api.readOAuthAvailability(), { apple: false, google: true })
assert.deepEqual(await api.readOAuthAvailability(), { apple: false, google: true })
assert.equal(requests, 3, 'failed requests retry and successful settings are shared for this page')
const refreshed = await import('../.local/oauth-auth-test.mjs?enabled')
response = { ok: true, json: async () => ({ external: { apple: true, google: true } }) }
assert.deepEqual(await refreshed.readOAuthAvailability(), { apple: true, google: true }, 'a new page detects Apple enabled without a build-time switch')
console.log('PASS: Apple and Google OAuth, same-origin redirects, preserved share tokens, safe callback errors, provider flags, and retry/cache behavior.')
