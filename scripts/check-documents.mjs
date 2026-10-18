import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { build } from 'esbuild'
import 'fake-indexeddb/auto'

// The production module is tested unchanged with the IndexedDB implementation
// used for Node-based browser-storage tests. No real browser data is accessed.
await fs.mkdir(new URL('../.local', import.meta.url), { recursive: true })
await build({ entryPoints: ['src/lib/documents.ts'], bundle: true, platform: 'node', format: 'esm', outfile: '.local/documents-test.mjs' })
const { safeWebUrl, saveDocuments, readDocuments, importDocuments, serializeDocuments } = await import('../.local/documents-test.mjs')

// Node has Blob/File but not FileReader; reproduce the standard readAsDataURL
// boundary so backup bytes can be checked independently against the input.
globalThis.FileReader = class {
  async readAsDataURL(blob) {
    this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`
    this.onload()
  }
}

for (const invalid of ['javascript:alert(1)', 'data:text/html,test', 'file:///private/test', 'https://name:secret@example.com/', 'not a URL']) assert.equal(safeWebUrl(invalid), null)
assert.equal(safeWebUrl(' https://example.com/document '), 'https://example.com/document')

const payload = 'Synthetic CV / 文件保存測試\nVersion 1\n'
const original = { id: 'fixture-v1', name: 'CV-v1.txt', category: 'CV', programId: 'school-a', stage: '草稿', note: 'Version one', blob: new Blob([payload], { type: 'text/plain' }), size: Buffer.byteLength(payload), archived: false, createdAt: '2026-09-16T00:00:00.000Z' }
const common = { id: 'fixture-link', name: 'Shared reference', category: 'LoR', programId: null, stage: '待審閱', note: '', url: 'https://example.com/lor', size: 0, archived: false, createdAt: original.createdAt }
await saveDocuments([original, common])
let saved = await readDocuments()
assert.equal(saved.length, 2)
assert.equal(await saved.find((doc) => doc.id === original.id).blob.text(), payload)
assert.equal(saved.find((doc) => doc.id === common.id).programId, null)

await saveDocuments([{ ...original, id: 'fixture-v2', name: 'CV-v2.txt', stage: '定稿' }])
await saveDocuments([{ ...original, archived: true }])
saved = await readDocuments()
assert.equal(saved.length, 3, 'adding another version must not overwrite v1')
assert.equal(saved.find((doc) => doc.id === original.id).archived, true)
assert.equal(await saved.find((doc) => doc.id === original.id).blob.text(), payload, 'archiving retains file bytes')

const json = await serializeDocuments(saved)
const backup = JSON.parse(json)
assert.equal(Buffer.from(backup.entries.find((doc) => doc.id === original.id).data.split(',')[1], 'base64').toString('utf8'), payload)
const restored = await importDocuments(new File([json], 'backup.json'))
assert.equal(restored.length, 3)
assert.equal((await readDocuments()).length, 6, 'restore adds copies instead of replacing existing files')
assert.equal(await restored.find((doc) => doc.name === original.name).blob.text(), payload)
assert.equal(restored.find((doc) => doc.name === original.name).archived, true)
assert.ok(restored.every((doc) => !saved.some((old) => old.id === doc.id)))

const before = (await readDocuments()).length
const broken = structuredClone(backup)
broken.entries.push({ ...broken.entries[0], data: undefined, url: 'javascript:alert(1)' })
await assert.rejects(() => importDocuments(new File([JSON.stringify(broken)], 'broken.json')))
assert.equal((await readDocuments()).length, before, 'invalid backup must not partially import valid entries')
await assert.rejects(() => importDocuments(new File(['{"version":1,"entries":[]}'], 'wrong.json')))
await saveDocuments([{ ...original, archived: false }])
assert.equal((await readDocuments()).find((doc) => doc.id === original.id).archived, false)
console.log('PASS: file persistence, separate versions, shared/school metadata, archive/restore, exact-byte backup round trip, safe links, and all-or-nothing import validation.')
