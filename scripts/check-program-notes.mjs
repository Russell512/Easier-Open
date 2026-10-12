import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { build } from 'esbuild'

const storage = new Map()
let failWrites = false
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => {
    if (failWrites) throw new DOMException('Storage quota exceeded', 'QuotaExceededError')
    storage.set(key, String(value))
  },
}
globalThis.window = new EventTarget()
let changes = 0
window.addEventListener('easier-local-change', () => { changes++ })
await fs.mkdir('.local', { recursive: true })
await build({ entryPoints: ['src/lib/notes.ts'], bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: '.local/program-notes-test.mjs', define: { 'import.meta.env.VITE_LOCAL_MODE': 'false', 'import.meta.env.VITE_SUPABASE_URL': '""', 'import.meta.env.VITE_SUPABASE_ANON_KEY': '""' } })
const api = await import('../.local/program-notes-test.mjs')

localStorage.setItem(api.LEGACY_NOTES_STORAGE_KEY, JSON.stringify({ text: '原本的申請紀錄', savedAt: '2026-10-01T12:00:00Z' }))
const initial = api.loadApplicationNotes()
assert.equal(initial.notes[0].body, '原本的申請紀錄')
assert.equal(initial.notes[0].programId, undefined, 'legacy notes stay unassigned')
const ms = 'University of Illinois Urbana-Champaign|||MS Computer Science'
const mcs = 'University of Illinois Urbana-Champaign|||Master of Computer Science (MCS)'
const body = '研究型 MS：想找 ML lab\n待確認：能否參與研究？\nhttps://example.edu/research'
let state = api.updateProgramNote(initial, ms, 'UIUC · MSCS', body)
state = api.updateProgramNote(state, mcs, 'UIUC · MCS', '就業導向；確認課程與實習')
assert.equal(state.selectedNoteId, initial.selectedNoteId, 'editing a program does not change the general notes selection')
assert.deepEqual(state.notes.find((note) => !note.programId), initial.notes[0], 'existing global notes remain intact')
const msNoteId = state.notes.find((note) => note.programId === ms).id
state = api.updateProgramNote(state, ms, 'Renamed title', `${body}\n補充紀錄`)
assert.equal(state.notes.filter((note) => note.programId === ms).length, 1)
assert.equal(state.notes.find((note) => note.programId === ms).id, msNoteId)
assert.equal(state.notes.find((note) => note.programId === mcs).body, '就業導向；確認課程與實習', 'degrees at the same school stay independent')
api.saveApplicationNotes(state)
assert.equal(changes, 1, 'saving notifies cloud synchronization')
assert.deepEqual(api.loadApplicationNotes(), state, 'reload preserves program associations, Unicode and line breaks')
state = api.updateProgramNote(state, ms, 'UIUC · MSCS', '')
api.saveApplicationNotes(state)
assert.equal(api.loadApplicationNotes().notes.find((note) => note.programId === ms).body, '', 'intentionally cleared content stays cleared')
assert.equal(api.updateProgramNote(state, 'not-yet-written', 'New program', ''), state, 'viewing an empty program does not create a note')

const stored = localStorage.getItem(api.NOTES_STORAGE_KEY)
const changeCount = changes
failWrites = true
assert.throws(() => api.saveApplicationNotes(api.updateProgramNote(state, ms, 'UIUC · MSCS', 'unsaved draft')), { name: 'QuotaExceededError' })
assert.equal(localStorage.getItem(api.NOTES_STORAGE_KEY), stored, 'failed persistence keeps the previous saved copy')
assert.equal(changes, changeCount, 'failed persistence never signals a successful save')
console.log('PASS: legacy notes, program isolation, repeated editing, clearing, reload, cloud notification and failed-save preservation.')
