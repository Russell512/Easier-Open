import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { build } from 'esbuild'

await fs.mkdir('.local', { recursive: true })
const user = id => ({ id, user_metadata: {} })
const session = id => ({ user: user(id), access_token: `token-${id}` })
const fixture = { session: session('A'), sessionRead: null }
globalThis.accountUserFixture = fixture
await build({
  stdin: { contents: "export * from './src/lib/accountUser'; export * from './src/lib/accountSession'", resolveDir: process.cwd() },
  outfile: '.local/account-user-under-test.mjs', bundle: true, platform: 'node', format: 'esm',
  define: { 'import.meta.env.VITE_SUPABASE_URL': '"https://example.supabase.co"', 'import.meta.env.VITE_SUPABASE_ANON_KEY': '"public-test-key"' },
  plugins: [{ name: 'account-fixture', setup(build) {
    build.onResolve({ filter: /cloudClient$/ }, () => ({ path: 'cloud', namespace: 'fixture' }))
    build.onResolve({ filter: /accountCloud$/ }, () => ({ path: 'scope', namespace: 'fixture' }))
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'cloud'
      ? 'export const cloud = {auth:{getSession:()=>globalThis.accountUserFixture.sessionRead?.() ?? Promise.resolve({data:{session:globalThis.accountUserFixture.session},error:null})}}'
      : 'export const createAccountCloud = (session,guard) => ({userId:session.user.id,client:{},assert:guard.assert})' }))
  } }],
})
const { captureAccountUser, updateAccountUser, createAccountGuard, bindAccountGuard } = await import('../.local/account-user-under-test.mjs')
const originalFetch = globalThis.fetch, originalWindow = globalThis.window
const events = [], requests = []
globalThis.window = { dispatchEvent: event => { events.push(event); return true } }
let responseUser = user('A'), resolveRequest
globalThis.fetch = async (url, init) => {
  requests.push({ url, init })
  if (resolveRequest) await new Promise(resolve => { resolveRequest.resolve = resolve })
  return { ok: true, json: async () => responseUser }
}
try {
  const a = createAccountGuard('A'); bindAccountGuard(a)
  await updateAccountUser('A', { data: { easier_display_name: 'Alice' } })
  assert.equal(requests[0].init.headers.Authorization, 'Bearer token-A')
  assert.deepEqual(JSON.parse(requests[0].init.body), { data: { easier_display_name: 'Alice' } })
  assert.equal(events[0].detail.id, 'A')
  const pinned = await captureAccountUser('A')
  fixture.session = session('B')
  await pinned.update({ password: 'synthetic-password-only' })
  assert.equal(requests.at(-1).init.headers.Authorization, 'Bearer token-A', 'delayed auth notifications cannot redirect an A update into B')
  a.invalidate(); bindAccountGuard(createAccountGuard('B'))
  const count = requests.length
  await assert.rejects(pinned.update({ data: {} }), /帳號已切換/)
  await assert.rejects(updateAccountUser('A', { data: {} }), /重新登入/)
  assert.equal(requests.length, count)

  const waitingGuard = createAccountGuard('A'); bindAccountGuard(waitingGuard)
  let releaseSession
  fixture.sessionRead = () => new Promise(resolve => { releaseSession = resolve })
  const reading = captureAccountUser('A')
  waitingGuard.invalidate(); bindAccountGuard(createAccountGuard('B'))
  releaseSession({ data: { session: session('A') }, error: null })
  await assert.rejects(reading, /帳號已切換/)
  fixture.sessionRead = null; fixture.session = session('A')

  const inFlightGuard = createAccountGuard('A'); bindAccountGuard(inFlightGuard)
  const inFlight = await captureAccountUser('A')
  resolveRequest = {}
  const pending = inFlight.update({ data: {} })
  const eventsBefore = events.length
  inFlightGuard.invalidate(); bindAccountGuard(createAccountGuard('B'))
  resolveRequest.resolve(); resolveRequest = null
  await assert.rejects(pending, /帳號已切換/)
  assert.equal(events.length, eventsBefore, 'stale responses cannot update the next account UI')
  assert.equal(requests.at(-1).init.signal.aborted, true)

  bindAccountGuard(createAccountGuard('A')); responseUser = user('B')
  await assert.rejects(updateAccountUser('A', { data: {} }), /帳號回應不符/)
  console.log('PASS: profile/password requests retain the initiating token, UID changes abort stale operations, session-read races fail closed, and foreign responses never update UI.')
} finally {
  globalThis.fetch = originalFetch; globalThis.window = originalWindow
  delete globalThis.accountUserFixture
}
