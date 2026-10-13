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
