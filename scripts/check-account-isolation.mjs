import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { build } from 'esbuild'
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'

class MemoryStorage {
  data = new Map()
  failKey = null
  getItem(key) { return this.data.get(key) ?? null }
  setItem(key, value) {
    if (key === this.failKey) { this.failKey = null; throw new Error('simulated storage quota') }
    this.data.set(key, String(value))
  }
  removeItem(key) { this.data.delete(key) }
  clear() { this.data.clear() }
}
globalThis.localStorage = new MemoryStorage()
globalThis.indexedDB = new IDBFactory()
globalThis.window = new EventTarget()
await fs.mkdir('.local', { recursive: true })
await build({
  stdin: { contents: "export * from './src/lib/accountCache'; export * from './src/lib/accountSession'; export * from './src/lib/accountCloud'; export * from './src/lib/cloudSnapshot'; export * from './src/lib/documents'; export * from './src/lib/cloudClient';", resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: '.local/account-isolation-test.mjs',
  define: { 'import.meta.env.VITE_LOCAL_MODE': '"true"', 'import.meta.env.VITE_SUPABASE_URL': '"https://auth.example.test"', 'import.meta.env.VITE_SUPABASE_ANON_KEY': '"public-test-key"' },
})
const api = await import('../.local/account-isolation-test.mjs')
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222', C = '33333333-3333-4333-8333-333333333333'
const NOTES = 'easier-application-notes-v2', TABS = 'easier-workspace-tabs-v1', BASELINE = 'easier-cloud-baseline-v1'
const note = text => JSON.stringify({ text })
const doc = (id, body) => ({ id, name: `${id}.txt`, category: 'SOP', programId: null, stage: '草稿', note: `${id}-private`, blob: new Blob([body], { type: 'text/plain' }), size: body.length, createdAt: '2026-10-19T00:00:00.000Z', archived: false })
let guard
function newDocument(userId) {
  guard?.invalidate()
  guard = api.createAccountGuard(userId)
  api.bindAccountGuard(guard)
  api.resetCloudSnapshotCaches()
  return guard
}
async function archivedBanks() {
  const db = await new Promise((resolve, reject) => { const request = indexedDB.open(api.ACCOUNT_CACHE_DB, 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
  return new Promise((resolve, reject) => { const transaction = db.transaction('accounts', 'readonly'); const request = transaction.objectStore('accounts').getAll(); transaction.oncomplete = () => { db.close(); resolve(request.result) }; transaction.onabort = () => { db.close(); reject(transaction.error) } })
}

// Existing owner's data predates account caches. Only its stored baseline identifies it.
newDocument(A)
localStorage.setItem(BASELINE, JSON.stringify({ userId: A, revision: 7, signature: 'sha256:older-cloud-version' }))
localStorage.setItem(NOTES, note('A unsynced legacy note'))
localStorage.setItem(TABS, note('A private tabs'))
localStorage.setItem('easier-local-profile-v1', note('A local preferences'))
localStorage.setItem('unrelated-auth-setting', 'keep-this-value')
await api.replaceDocuments([doc('a', 'A exact unsynced document')])
assert.deepEqual(await api.activateAccountBank(A, guard), { switched: false, quarantined: false })
assert.equal(localStorage.getItem(api.ACTIVE_ACCOUNT_KEY), A)
assert.equal(localStorage.getItem(NOTES), note('A unsynced legacy note'))

newDocument(B)
assert.deepEqual(await api.activateAccountBank(B, guard), { switched: true, quarantined: false })
for (const key of api.ACCOUNT_LOCAL_KEYS) assert.equal(localStorage.getItem(key), null, `new B must not inherit ${key}`)
assert.equal((await api.readDocuments()).length, 0, 'new B must not inherit any A document')
assert.equal(localStorage.getItem('unrelated-auth-setting'), 'keep-this-value', 'switching never clears auth settings or unrelated origin state')
const preservedA = (await archivedBanks()).find(bank => bank.id === A)
assert.equal(preservedA.values[NOTES], note('A unsynced legacy note'))
assert.equal(await preservedA.documents[0].blob.text(), 'A exact unsynced document')
localStorage.setItem(NOTES, note('B private note'))
localStorage.setItem(TABS, note('B private tabs'))
localStorage.setItem(BASELINE, JSON.stringify({ userId: B, revision: 2, signature: 'sha256:B' }))
await api.replaceDocuments([doc('b', 'B document')])
await api.preserveActiveAccount(B, guard)

newDocument(A)
await api.activateAccountBank(A, guard)
assert.equal(localStorage.getItem(NOTES), note('A unsynced legacy note'), 'A unsynced work returns on re-login')
assert.equal(localStorage.getItem(TABS), note('A private tabs'))
assert.equal(JSON.parse(localStorage.getItem(BASELINE)).revision, 7)
assert.equal(await (await api.readDocuments())[0].blob.text(), 'A exact unsynced document')
localStorage.setItem(NOTES, note('A newer edit after cache restore'))

// If preservation fails, none of the active data or document bytes may be touched.
newDocument(B)
const put = IDBObjectStore.prototype.put
IDBObjectStore.prototype.put = function (...args) {
  if (this.transaction.db.name === api.ACCOUNT_CACHE_DB) throw new DOMException('No remaining quota', 'QuotaExceededError')
  return put.apply(this, args)
}
await assert.rejects(api.activateAccountBank(B, guard), /本機備份未完成/)
IDBObjectStore.prototype.put = put
assert.equal(localStorage.getItem(api.ACTIVE_ACCOUNT_KEY), A)
assert.equal(localStorage.getItem(NOTES), note('A newer edit after cache restore'))
assert.equal(await (await api.readDocuments())[0].blob.text(), 'A exact unsynced document')
assert.equal(localStorage.getItem(api.ACCOUNT_SWITCH_KEY), null)

// Crash after document restoration but during localStorage writes. The journal
// prevents that partial bank from overwriting either complete archived account.
localStorage.failKey = NOTES
await assert.rejects(api.activateAccountBank(B, guard), /simulated storage quota/)
assert.ok(localStorage.getItem(api.ACCOUNT_SWITCH_KEY))
newDocument(B)
await api.activateAccountBank(B, guard)
assert.equal(localStorage.getItem(api.ACCOUNT_SWITCH_KEY), null)
assert.equal(localStorage.getItem(NOTES), note('B private note'))
assert.equal(await (await api.readDocuments())[0].blob.text(), 'B document')
newDocument(A)
await api.activateAccountBank(A, guard)
assert.equal(localStorage.getItem(NOTES), note('A newer edit after cache restore'), 'failed switching must never archive partial A data over the intact backup')

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const lateDownload = deferred(), lateUpload = deferred()
let cloudWrites = 0
const staleGuard = guard
const fakeClient = {
  storage: { from: () => ({ download: () => lateDownload.promise, upload: () => lateUpload.promise }) },
  rpc: async () => { cloudWrites++; return { data: 8, error: null } },
}
const staleContext = { userId: A, client: fakeClient, assert: staleGuard.assert }
const remote = { format: 'easier-cloud-v1', values: { [NOTES]: note('REMOTE A') }, documents: [{ ...doc('remote-a', ''), blob: undefined, path: `${A}/files/remote` }] }
const lateApply = api.applySnapshot(remote, A, staleContext)
const latePush = api.pushCloud({ format: 'easier-cloud-v1', values: {}, documents: [] }, new Map([[`${A}/files/pending`, new Blob(['pending'])]]), 7, staleContext)
const staleSave = api.saveDocuments([doc('late-a', 'must not appear in B')])
// Attach handlers before invalidation to avoid test-level unhandled rejection races.
const pendingAssertions = [assert.rejects(lateApply, /帳號|資料所屬/), assert.rejects(latePush, /帳號|資料所屬/), assert.rejects(staleSave, /帳號/)]
newDocument(B)
await api.activateAccountBank(B, guard)
lateDownload.resolve({ data: new Blob(['remote A bytes']), error: null })
lateUpload.resolve({ data: {}, error: null })
await Promise.all(pendingAssertions)
assert.equal(cloudWrites, 0, 'a late A upload cannot continue into an RPC save under B')
assert.equal(localStorage.getItem(NOTES), note('B private note'), 'a late A download cannot overwrite B local state')
assert.deepEqual((await api.readDocuments()).map(item => item.id), ['b'])
assert.throws(staleGuard.assert, /帳號已切換/)
guard.invalidate()
assert.throws(() => api.saveLocalValue(NOTES, note('late write')), /帳號已切換/)

// Real Supabase request building retains the captured account token, without
// relying on the mutable shared auth client's session at request time.
newDocument(B)
const requests = []
globalThis.fetch = async (_url, init) => {
  requests.push(new Headers(init.headers).get('authorization'))
  return new Response('true', { status: 200, headers: { 'Content-Type': 'application/json' } })
}
const scoped = api.createAccountCloud({ user: { id: B }, access_token: 'captured-B-token' }, guard)
assert.equal((await scoped.client.rpc('easier_ensure_workspace_access')).data, true)
assert.deepEqual(requests, ['Bearer captured-B-token'])
guard.invalidate()
const refused = await scoped.client.rpc('save_easier_workspace')
assert.ok(refused.error, 'invalidated account requests fail before reaching fetch')
assert.equal(requests.length, 1)

// With no identity evidence, old notes/blobs are recoverably quarantined and
// never silently become the next logged-in user's workspace.
newDocument(C)
for (const key of api.ACCOUNT_LOCAL_KEYS) localStorage.removeItem(key)
localStorage.removeItem(api.ACTIVE_ACCOUNT_KEY)
localStorage.setItem(NOTES, note('unclaimed legacy note'))
await api.replaceDocuments([doc('unclaimed', 'unclaimed exact document')])
const isolated = await api.activateAccountBank(C, guard)
assert.equal(isolated.quarantined, true)
assert.equal(localStorage.getItem(NOTES), null)
assert.equal((await api.readDocuments()).length, 0)
const quarantined = (await archivedBanks()).find(bank => bank.id.startsWith('unclaimed:'))
assert.equal(quarantined.values[NOTES], note('unclaimed legacy note'))
assert.equal(await quarantined.documents[0].blob.text(), 'unclaimed exact document')
console.log('PASS: baseline-owner migration, isolated A/B banks, unsynced notes and exact blobs, account tabs/preferences, archive quota failures, interrupted-switch recovery, stale reads/uploads/local writes, token-pinned requests, and unclaimed legacy quarantine.')
