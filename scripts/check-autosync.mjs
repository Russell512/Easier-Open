import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { build } from 'esbuild'

await fs.mkdir('.local', { recursive: true })
await build({ entryPoints: ['src/lib/syncQueue.ts'], bundle: true, platform: 'node', format: 'esm', outfile: '.local/autosync-test.mjs' })
const { createSyncQueue } = await import('../.local/autosync-test.mjs')
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done }); return { promise, resolve } }

let local = 'first edit'
let remote = ''
let revision = 0
let active = 0
let maximumActive = 0
const writes = []
const firstSave = deferred()
const secondSave = deferred()
const secondStarted = deferred()
const queue = createSyncQueue(async () => {
  active++
  maximumActive = Math.max(maximumActive, active)
  const snapshot = local
  const expectedRevision = revision
  writes.push(snapshot)
  if (writes.length === 1) await firstSave.promise
  if (writes.length === 2) { secondStarted.resolve(); await secondSave.promise }
  assert.equal(revision, expectedRevision, 'requests share a serial revision sequence')
  remote = snapshot
  revision++
  active--
  return local !== snapshot
})
const first = queue.request()
local = 'second edit during upload'
assert.equal(queue.request(), first, 'concurrent save requests share the same completion promise')
firstSave.resolve()
await secondStarted.promise
local = 'third edit after a switch to another workspace page'
// No explicit request: a changed final snapshot must also drain immediately.
secondSave.resolve()
await first
assert.equal(remote, local)
assert.equal(maximumActive, 1, 'cloud writes never overlap')
assert.deepEqual(writes, ['first edit', 'second edit during upload', 'third edit after a switch to another workspace page'])

let offline = true
let attempts = 0
const retryQueue = createSyncQueue(async () => {
  attempts++
  if (offline) throw new Error('offline')
  return false
})
await assert.rejects(retryQueue.request(), /offline/)
offline = false
await retryQueue.request()
assert.equal(attempts, 2, 'a failed save can be retried after reconnecting')
console.log('PASS: changes during uploads drain immediately, requests use one revision sequence, completion waits for the latest edit, and failures can retry.')
