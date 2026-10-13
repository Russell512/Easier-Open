import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { build } from 'esbuild'
import XLSX from 'xlsx'
await fs.mkdir('.local', { recursive: true })
await build({ stdin: { contents: "export * from './src/lib/shortlistExport'; export * from './src/lib/workbook'; export * from './src/lib/selection';", resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: '.local/shortlist-test.mjs' })
const api = await import('../.local/shortlist-test.mjs')
const wb = XLSX.utils.book_new()
const names = ['MSCS', 'MCS', 'MS Data Science', 'MS AI', 'MS Robotics', 'MS HCI', 'MS ECE', 'MS Software']
const rows = names.map((name, index) => ({ University: index < 2 ? 'Example University' : `Example ${index}`, 'Program Name': name, Degree: 'MS', Notes: '備註，中文 "引號"\n第二行', 'GRE Requirement': 'Unknown', 'Application Deadline': new Date('2027-01-15T00:00:00Z'), 'Selection Result': '主申' }))
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Programs')
let model = api.parseWorkbook(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
let programs = api.buildProgramViews(model)
let selection = api.createInitialSchoolSelection(model)
selection = { ...selection, results: {}, rankingOrder: programs.map(p => p.id).reverse() }
for (const [index, category] of ['主申', '衝刺', '較為保險', '彩票', '淘汰', '未分類', 'unknown'].entries()) selection.results[programs[index].id] = category
// The last program has no saved result; stale workbook classifications cannot include it.
model = api.editWorkbookModel(model, [api.makeEdit(model.workbook, programs[0].row, 'GRE Requirement', 'Required')])
programs = api.buildProgramViews(model)
const before = JSON.stringify(model.workbook)
const csv = api.createShortlistCsv(model, programs, selection)
assert.ok(csv.startsWith('\uFEFF'), 'UTF-8 BOM makes Traditional Chinese readable in Excel')
const parsed = XLSX.read(csv.slice(1), {type:'string',raw:true})
const exported = XLSX.utils.sheet_to_json(parsed.Sheets[parsed.SheetNames[0]])
assert.equal(exported.length,4, 'only four shortlisted categories are exported')
assert.deepEqual(exported.map(p => p['Selection Result']), ['彩票','衝刺','主申','較為保險'])
assert.deepEqual(exported.map(p => p['Program Name']), ['MS AI','MCS','MSCS','MS Data Science'])
assert.equal(exported.find(p=>p['Program Name']==='MSCS')['GRE Requirement'],'Required','latest edited workbook values are used')
assert.ok(exported.every(p=>p.Notes === rows[0].Notes), 'quotes, commas and multiline Chinese round-trip')
assert.equal(Object.keys(exported[0])[0],'Selection Result')
assert.equal(JSON.stringify(model.workbook),before,'export never edits the workspace')
selection.results[programs[0].id]='淘汰'
assert.equal(api.shortlistPrograms(programs,selection).length,3,'classification changes immediately affect export')
const emptyCsv = api.createShortlistCsv(model, programs, {...selection,results:{}})
assert.ok(emptyCsv.includes('GRE Requirement') && emptyCsv.includes('Selection Result'),'empty exports retain column headers')
const full = XLSX.read(api.createProgramsCsv(model.workbook,programs,selection),{type:'string',raw:true})
assert.equal(XLSX.utils.sheet_to_json(full.Sheets[full.SheetNames[0]]).length,8,'existing full CSV export is unchanged')
console.log('PASS: shortlist-only CSV, current classifications and edits, stable category order, same-school degrees, Unicode/CSV escaping, empty headers, full export compatibility, and no mutation.')
