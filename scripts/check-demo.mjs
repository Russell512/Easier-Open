import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { build } from 'esbuild'
await fs.mkdir('.local',{recursive:true})
await build({stdin:{contents:"export * from './src/lib/workbook';export * from './src/lib/selection';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.local/demo-test.mjs',define:{'import.meta.env.VITE_LOCAL_MODE':'true','import.meta.env.VITE_SUPABASE_URL':'""','import.meta.env.VITE_SUPABASE_ANON_KEY':'""'}})
const api = await import('../.local/demo-test.mjs')
const bytes = await fs.readFile('public/data/update_info.xlsx')
const model = api.parseWorkbook(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))
const programs = api.buildProgramViews(model)
assert.equal(programs.length,6)
assert.equal(model.checklist.length,6)
assert.ok(programs.every(p=>p.university.startsWith('Example University') && p.checklistRow))
const selection = api.createInitialSchoolSelection(model)
assert.equal(new Set(Object.values(selection.results)).size,6)
assert.equal(programs.filter(p=>api.hasSelectionDecision(selection,p.id)).length,5)
assert.equal(model.workbook.Sheets['Easier Template'].A2.v,'easier-demo-v1')
console.log('PASS: fictional template, program/checklist joins, six categories, and reviewed decisions.')
