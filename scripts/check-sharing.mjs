import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { build } from 'esbuild'
import XLSX from 'xlsx'
await fs.mkdir('.local', { recursive: true })
await build({ stdin: { contents: "export * from './src/lib/sharedShortlist'; export * from './src/lib/workbook'; export * from './src/lib/selection';", resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: '.local/sharing-test.mjs' })
const api = await import('../.local/sharing-test.mjs')
const wb = XLSX.utils.book_new()
const categories = ['彩票','衝刺','主申','較為保險','淘汰','未分類']
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(categories.map((category,i) => ({ University: 'Fictional University', 'Program Name': `Program ${i}`, Degree: 'MS', 'Selection Result': category, 'Official Program URL': 'https://example.com/program', 'Official Application URL': 'javascript:alert(1)', 'GRE Requirement': 'Required', Notes: 'PRIVATE_NOTE', 'Next Action': 'PRIVATE_TASK', 'Research Fit Reason': 'PRIVATE_REASON', 'Research Fit Score': 9 }))), 'Programs')
const model = api.parseWorkbook(XLSX.write(wb, { type:'array',bookType:'xlsx' }))
const programs = api.buildProgramViews(model)
const selection = api.createInitialSchoolSelection(model)
const projection = api.createSharedShortlist(programs,selection)
assert.equal(projection.programs.length,4)
assert.deepEqual(projection.programs.map(p=>p.category),categories.slice(0,4))
assert.equal(projection.programs[0].requirements.gre.value,'Required')
assert.equal(projection.programs[0].website,'https://example.com/program')
assert.equal(projection.programs[0].applicationUrl,'')
assert.ok(!JSON.stringify(projection).includes('PRIVATE_'))
assert.ok(!JSON.stringify(projection).includes('sourceBase64'))
assert.equal(api.shareTokenFromUrl('?share='+ 'a'.repeat(48)), 'a'.repeat(48))
assert.equal(api.shareTokenFromUrl('?share=../../workspace'),null)
assert.equal(api.shareTokenFromUrl('?share='+ 'a'.repeat(47)),null)
selection.results[programs[0].id]='淘汰'
assert.equal(api.createSharedShortlist(programs,selection).programs.length,3)
console.log('PASS: shared projection includes four categories and official fields only; private data and unsafe URLs excluded; invalid tokens rejected.')

// Run the real account-pinned Supabase client with deterministic network/session
// races. No service key or live project is involved in these publication tests.
const session = id => ({ user: { id, user_metadata: {} }, access_token: `synthetic-token-${id}` })
const fixture = { session: session('A'), sessionRead: null }
globalThis.sharingFixture = fixture
await build({
  stdin: { contents: "export * from './src/lib/sharing'; export * from './src/lib/accountSession';", resolveDir: process.cwd() },
  outfile: '.local/sharing-account-test.mjs', bundle: true, platform: 'node', format: 'esm', packages: 'external',
  define: { 'import.meta.env.VITE_SUPABASE_URL': '"https://example.supabase.co"', 'import.meta.env.VITE_SUPABASE_ANON_KEY': '"public-synthetic-key"' },
  plugins: [{ name: 'sharing-session-fixture', setup(build) {
    build.onResolve({ filter: /cloudClient$/ }, () => ({ path: 'cloud', namespace: 'fixture' }))
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const cloud = {auth:{getSession:()=>globalThis.sharingFixture.sessionRead?.() ?? Promise.resolve({data:{session:globalThis.sharingFixture.session},error:null})}}' }))
  } }],
})
const { captureShortlistSharing, createAccountGuard, bindAccountGuard } = await import('../.local/sharing-account-test.mjs')
const originalFetch = globalThis.fetch
const requests = []
const settings = { token: 'a'.repeat(48), enabled: true, require_login: false, published_at: '2026-10-19T00:00:00Z' }
let holdRequest = null
globalThis.fetch = async (url, init) => {
  requests.push({ url: String(url), init })
  if (holdRequest) { holdRequest.started(); await holdRequest.response }
  return new Response(JSON.stringify(init?.method === 'GET' ? [settings] : settings), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
const configuration = { enabled: true, requireLogin: false, shortlist: projection }
const nextGuard = id => { const guard = createAccountGuard(id); bindAccountGuard(guard); return guard }
const deferNetwork = () => {
  let started, release
  const began = new Promise(resolve => { started = resolve })
  const response = new Promise(resolve => { release = resolve })
  holdRequest = { started, response }
  return { began, release: () => { holdRequest = null; release() } }
}
try {
  const a = nextGuard('A')
  const sharing = await captureShortlistSharing('A')
  fixture.session = session('B') // Auth changes before its observer invalidates A.
  assert.deepEqual(await sharing.configure(configuration), settings)
  assert.equal(new Headers(requests.at(-1).init.headers).get('Authorization'), 'Bearer synthetic-token-A', 'A shortlist never publishes with the mutable B session token')
  assert.deepEqual(JSON.parse(requests.at(-1).init.body).next_shortlist, projection)
  assert.deepEqual(await sharing.read(), settings)
  assert.equal(new Headers(requests.at(-1).init.headers).get('Authorization'), 'Bearer synthetic-token-A')
  assert.equal(new URL(requests.at(-1).url).searchParams.get('user_id'), 'eq.A', 'settings reads explicitly filter the initiating uid')
  a.invalidate(); nextGuard('B')
  const count = requests.length
  await assert.rejects(sharing.configure(configuration), /帳號已切換/)
  await assert.rejects(sharing.read(), /帳號已切換/)
  await assert.rejects(captureShortlistSharing('A'), /重新登入/)
  assert.equal(requests.length, count, 'invalidated sharing operations send no requests')

  nextGuard('A'); fixture.session = session('B')
  await assert.rejects(captureShortlistSharing('A'), /登入帳號已變更/, 'session mismatch cannot publish old shortlist contents')
  assert.equal(requests.length, count)
  const readingGuard = nextGuard('A')
  let releaseSession
  fixture.sessionRead = () => new Promise(resolve => { releaseSession = resolve })
  const capturing = captureShortlistSharing('A')
  readingGuard.invalidate(); nextGuard('B')
  releaseSession({ data: { session: session('A') }, error: null })
  await assert.rejects(capturing, /帳號已切換/, 'account changes while loading a session fail closed')
  fixture.sessionRead = null

  for (const operation of ['configure', 'read']) {
    const pendingGuard = nextGuard('A'); fixture.session = session('A')
    const pendingSharing = await captureShortlistSharing('A')
    const network = deferNetwork()
    const pending = operation === 'configure' ? pendingSharing.configure(configuration) : pendingSharing.read()
    await network.began
    pendingGuard.invalidate(); nextGuard('B'); fixture.session = session('B')
    network.release()
    await assert.rejects(pending, /帳號已切換/, `late ${operation} responses cannot update the next account's dialog`)
    assert.equal(requests.at(-1).init.signal.aborted, true)
    assert.equal(new Headers(requests.at(-1).init.headers).get('Authorization'), 'Bearer synthetic-token-A')
  }
  console.log('PASS: sharing reads/publications retain the initiating account token, settings queries filter its uid, account/session races fail closed, and late responses cannot update another account’s UI.')
} finally {
  globalThis.fetch = originalFetch
  delete globalThis.sharingFixture
}
