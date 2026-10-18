import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { build } from 'esbuild'
import XLSX from 'xlsx'

await fs.mkdir('.local', { recursive: true })
await build({
  stdin: { contents: "export * from './src/lib/programImport'; export * from './src/lib/workbook';", resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: '.local/program-import-test.mjs',
})
const api = await import('../.local/program-import-test.mjs')
const toModel = workbook => api.parseWorkbook(XLSX.write(workbook, { type: 'array', bookType: 'xlsx', cellStyles: true }))
const workbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
  University: 'Example University', 'Program Name': 'Computer Science', Degree: 'MS', Campus: 'Main Campus',
  'Application Deadline': new Date(2027, 0, 15), 'Application Fee USD｜空白待核實': 75,
  Notes: '原本的筆記', 'Application Status': 'Submitted', 'Last Verified Date': new Date(2026, 9, 1),
  'Program Identity Verified': '2026-10-01', 'Requirements Verified': '2026-10-01',
  'Requirement Evidence JSON': '{"gre":{"value":"Required","sources":["https://example.edu/"]}}',
  'Deadline Events JSON': '[{"date":"2027-01-15"}]', 'Deadline Status': 'confirmed',
  'Selection Result': '主申', 'Personal Desirability Rank': 1, 'Research Fit｜原表個人評分': 8,
  'Official Program URL': 'https://example.edu/program', 'Official Application URL': 'https://example.edu/apply',
  'Recommendation Letters': 3, 'Tuition Amount USD': 10000, 'Time-Zone Offset to Taipei (days)': -0.5,
}]), 'Programs')
XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
  University: 'Example University', Program: 'Computer Science', CV: 'Completed', GRE: 'Verified',
  'Target Date': new Date(2026, 11, 15), 'Next Action': '完成目前申請', 'Custom Checklist Note': '保留自訂欄位',
}]), 'Application Checklist')
XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
  University: 'Example University', Program: 'Computer Science', 'Faculty Name': 'Existing Professor', Notes: '私人筆記',
}]), 'Faculty')
XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
  University: 'Example University', Program: 'Computer Science', Task: 'Existing task', 'My Target｜內部規劃': new Date(2026, 11, 1),
}]), 'Per-Program Timeline')
XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ Task: 'Shared task', Notes: '不能丟失' }]), 'Master Timeline')
const audit = XLSX.utils.aoa_to_sheet([['Number', 'Formula'], [7, 14]])
audit.B2 = { t: 'n', v: 14, f: 'A2*2' }
audit['!cols'] = [{ wch: 12 }, { wch: 30 }]
XLSX.utils.book_append_sheet(workbook, audit, 'Custom Audit')
let model = toModel(workbook)
model = api.editWorkbookModel(model, [
  api.makeEdit(model.workbook, model.programs[0], 'Notes', '已修改但原始檔尚未更新'),
  api.makeEdit(model.workbook, model.checklist[0], 'CV', 'In progress'),
])
const original = JSON.stringify(model.workbook)

const manual = api.previewManualProgram({
  University: 'New University', 'Program Name': 'MS Robotics', Degree: 'MS', Campus: 'Taipei',
  'Application Deadline': '2028-02-29', 'Application Fee': '85.5',
  'Official Program URL': 'https://new.example.edu/program',
  Notes: '=HYPERLINK("https://example.com","literal only")',
  'Requirements Verified': '2030-01-01', 'Application Status': 'Submitted',
  'Selection Result': '主申', 'Personal Desirability Rank': '1', 'Research Fit Score': '10',
  'Requirement Evidence JSON': '{"gre":{"value":"Not required"}}',
  'Next Action': 'Submit another program immediately', 'Action Deadline': '2027-01-01',
  'Internal Planning Deadline｜非官方承諾': '2027-01-02',
}, model)
assert.equal(manual.readyCount, 1)
assert.equal(manual.rows[0].values['Application Fee USD｜空白待核實'], 85.5)
assert.ok(manual.rows[0].warnings.some(message => message.includes('純文字')))
assert.ok(manual.rows[0].warnings.some(message => message.includes('查核標記')))
const added = api.appendPrograms(model, manual)
assert.equal(JSON.stringify(model.workbook), original, 'adding must not mutate the active snapshot before persistence succeeds')
assert.equal(added.model.programs.length, model.programs.length + 1)
assert.equal(added.model.checklist.length, model.checklist.length + 1)
assert.deepEqual(added.model.workbook.SheetNames, model.workbook.SheetNames, 'all auxiliary sheets remain present and in order')
assert.equal(added.model.programs[0].values.Notes, '已修改但原始檔尚未更新', 'latest cell edits survive source replacement')
assert.equal(added.model.checklist[0].values.CV, 'In progress', 'existing progress survives')
for (const name of ['Faculty', 'Per-Program Timeline', 'Master Timeline', 'Custom Audit']) {
  const previous = model.workbook.Sheets[name], next = added.model.workbook.Sheets[name]
  assert.equal(next['!ref'], previous['!ref'], `${name} does not inherit new program rows`)
  for (const address of Object.keys(previous).filter(key => !key.startsWith('!'))) {
    for (const field of ['v', 'f', 't']) assert.deepEqual(next[address]?.[field], previous[address]?.[field], `${name}!${address} ${field} is preserved`)
  }
}
const newProgram = api.buildProgramViews(added.model).at(-1)
assert.equal(newProgram.id, added.addedIds[0])
assert.equal(newProgram.completion, 0)
assert.equal(newProgram.status, 'Researching')
assert.equal(newProgram.row.values['Evidence Category'], '使用者新增／待核實')
assert.equal(newProgram.row.values['Deadline Status'], 'unverified')
for (const key of ['Requirements Verified', 'Last Verified Date', 'Program Identity Verified', 'Requirement Evidence JSON', 'Deadline Events JSON', 'Personal Desirability Rank', 'Research Fit Score', 'Action Deadline', 'Internal Planning Deadline｜非官方承諾']) {
  assert.equal(api.getValue(newProgram.row, key), null, `${key} cannot be copied from supplied CSV or another program`)
}
assert.equal(newProgram.row.values['Selection Result'], '未分類')
assert.equal(newProgram.nextAction, '核對官方學程與本輪申請要求', 'personal next actions from an exported row are not copied')
for (const field of api.CHECKLIST_FIELDS) assert.equal(newProgram.checklistRow.values[field], 'Not started', `${field} starts independently`)
assert.equal(newProgram.checklistRow.values['Custom Checklist Note'], null, 'custom checklist content is not cloned')
assert.equal(newProgram.checklistRow.values['Target Date'], null, 'existing program target dates are not inherited')
const programSheet = added.model.workbook.Sheets.Programs
const notesColumn = XLSX.utils.sheet_to_json(programSheet, { header: 1 })[0].indexOf('Notes')
const literalCell = programSheet[XLSX.utils.encode_cell({ r: newProgram.row.__row, c: notesColumn })]
assert.equal(literalCell.t, 's')
assert.equal(literalCell.f, undefined, 'spreadsheet-looking text never becomes an XLSX formula')
assert.ok(String(literalCell.v).startsWith('=HYPERLINK'))
const reloaded = api.parseWorkbook(added.buffer)
assert.equal(api.buildProgramViews(reloaded).at(-1).id, added.addedIds[0], 'program/document identity survives save and reload')
assert.throws(() => api.appendPrograms(reloaded, manual), /沒有可新增/, 'a stale preview cannot overwrite or duplicate newly added data')

const nearDuplicate = api.previewManualProgram({ University: '  Ｅｘａｍｐｌｅ\u00a0University ', 'Program Name': ' computer  science ', Degree: 'ms', Campus: 'MAIN CAMPUS' }, model)
assert.equal(nearDuplicate.duplicateCount, 1, 'case, Unicode width and repeated whitespace do not create duplicates')
const distinct = api.previewProgramsCsv('University,Program Name,Degree,Campus\nExample University,Computer Science,MS,Boston\nExample University,Computer Science,PhD,Main Campus\nexample university,computer science,ms,boston', model)
assert.equal(distinct.readyCount, 2, 'different explicit degree/campus combinations remain separate programs')
assert.equal(distinct.duplicateCount, 1, 'the second occurrence of a new identity in a batch is skipped')
assert.equal(new Set(distinct.rows.filter(row => row.status === 'ready').map(row => row.programName)).size, 2)
const distinctAdded = api.appendPrograms(model, distinct)
assert.equal(new Set(api.buildProgramViews(distinctAdded.model).map(program => program.id)).size, distinctAdded.model.programs.length)
assert.equal(api.previewManualProgram({ University: 'Example University', 'Program Name': 'Computer Science', Degree: 'MS', Campus: 'Boston' }, distinctAdded.model).duplicateCount, 1, 'disambiguated campuses are recognized on future imports')
assert.throws(() => api.appendPrograms(distinctAdded.model, distinct), /沒有可新增/, 'disambiguated stale previews are rechecked using original identity')

const csv = '\uFEFFProgram Name,University,Degree,Notes,Application Deadline,Official Program URL\r\n"MS, Data Science","測試大學",MS,"中文 \"\"引號\"\"\r\n第二行",2027-01-15,https://example.edu/program\r\n'
const csvPreview = api.previewProgramsCsv(csv, model)
assert.equal(csvPreview.readyCount, 1, 'BOM, exported column order, comma names, Unicode, escaped quotes and CRLF are accepted')
assert.equal(csvPreview.rows[0].values.Notes, '中文 "引號"\n第二行')
assert.equal(csvPreview.rows[0].line, 2)
const csvAdded = api.appendPrograms(model, csvPreview)
const exportAgain = api.createProgramsImportCsv(csvAdded.model)
assert.ok(exportAgain.startsWith('\uFEFF'))
const exportedPreview = api.previewProgramsCsv(exportAgain, csvAdded.model)
assert.equal(exportedPreview.errors.length, 0)
assert.equal(exportedPreview.invalidCount, 0)
assert.equal(exportedPreview.duplicateCount, csvAdded.model.programs.length, 'current CSV export round-trips and all existing rows are skipped')
assert.ok(exportAgain.includes('2027-01-15'), 'dates export as ISO instead of locale-dependent serials')
assert.ok(api.createProgramsImportCsv(added.model).includes("'=HYPERLINK"), 'CSV exports protect spreadsheet applications from formula-like text')
const blankWorkbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(blankWorkbook, XLSX.utils.aoa_to_sheet([['University', 'Program Name']]), 'Programs')
const emptyModel = toModel(blankWorkbook)
const formulaRoundtrip = api.previewProgramsCsv(api.createProgramsImportCsv(added.model), emptyModel)
assert.equal(formulaRoundtrip.rows.at(-1).values.Notes, newProgram.row.values.Notes)
const fromEmpty = api.appendPrograms(emptyModel, api.previewManualProgram({ University: 'First University', 'Program Name': 'First program' }, emptyModel))
assert.equal(fromEmpty.model.checklist.length, 1, 'first import can create a missing checklist sheet without requiring demo rows')
assert.equal(fromEmpty.model.programs.length, 1)

const cases = [
  ['', /空/],
  ['University,Name\nA,B', /Program Name/],
  ['University,Program Name,university\nA,B,C', /重複/],
  ['University,Program Name,\nA,B,', /空白/],
  ['University,Program Name\n"A,B', /未關閉/],
  ['University,Program Name\n"A"x,B', /引號後/],
  ['University,Program Name\nA"B,C', /雙引號/],
  ['University,Program Name\nA,\uFFFD', /UTF-8/],
  ['University,Program Name\nA,\0', /UTF-8/],
  [`University,Program Name\nA,${'x'.repeat(api.PROGRAM_IMPORT_LIMITS.maxCellLength + 1)}`, /20,000/],
  [`University,Program Name\n${Array.from({ length: 501 }, (_, index) => `U${index},P`).join('\n')}`, /500/],
  ['x'.repeat(api.PROGRAM_IMPORT_LIMITS.maxBytes + 1), /5 MB/],
]
for (const [text, pattern] of cases) assert.match(api.previewProgramsCsv(text, model).errors.join(' '), pattern)
assert.equal(api.previewProgramsCsv('University,Program Name\nA,B,C\nC,D', model).invalidCount, 1, 'incorrect column counts are reported per row')
assert.throws(() => api.appendPrograms(model, api.previewProgramsCsv('University,Program Name\nA,B,C\nC,D', model)), /沒有新增任何資料/, 'a batch with invalid rows cannot partially persist')
const badFields = [
  ['Application Deadline', '2027-02-29'], ['Application Deadline', '2027-13-01'],
  ['Application Deadline', '2027-04-31'], ['Application Deadline', '2027-1-1'],
  ['Official Program URL', 'javascript:alert(1)'], ['Official Program URL', 'data:text/html,hello'],
  ['Official Program URL', 'https://user:password@example.com'],
  ['Application Fee USD｜空白待核實', 'Infinity'], ['Application Fee USD｜空白待核實', '1e309'],
  ['Application Fee USD｜空白待核實', '-5'], ['Recommendation Letters', '1.5'],
  ['University', 'A|||B'], ['Program Name', 'A\nB'],
  ['Campus', 'x'.repeat(161)], ['Degree', 'MS\nPhD'],
]
for (const [field, value] of badFields) {
  assert.equal(api.previewManualProgram({ University: 'A', 'Program Name': 'B', [field]: value }, model).invalidCount, 1, `${field}: ${value} is rejected`)
}
assert.equal(api.previewManualProgram({ University: 'A' }, model).invalidCount, 1)
assert.equal(api.previewManualProgram({ 'Program Name': 'B' }, model).invalidCount, 1)
const unknown = api.previewProgramsCsv('University,Program Name,Unknown Custom Data\nA,B,ignored', model)
assert.equal(unknown.readyCount, 1)
assert.ok(unknown.warnings[0].includes('Unknown Custom Data'))
assert.equal(unknown.rows[0].values['Unknown Custom Data'], undefined)
assert.ok(api.createProgramTemplateCsv().includes('University') && api.createProgramTemplateCsv().includes('Program Name'))
assert.ok(api.PROGRAM_IMPORT_PROMPT.includes('YYYY-MM-DD') && api.PROGRAM_IMPORT_PROMPT.includes('待核實'))

const aliasWorkbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(aliasWorkbook, XLSX.utils.json_to_sheet([{
  University: 'University of California, San Diego', 'Program Name': 'MS Computer Science and Engineering', Degree: 'MS',
}]), 'Programs')
assert.equal(api.previewManualProgram({ University: 'university of california, san diego', 'Program Name': 'ms computer science (cs75)' }, toModel(aliasWorkbook)).duplicateCount, 1, 'the retained UCSD identity alias also detects case-normalized duplicates without depending on private source data')

// Verify against the actual distributed workbook, not a fixed row count or only synthetic fixtures.
const source = await fs.readFile('public/data/update_info.xlsx')
const actual = api.parseWorkbook(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength))
const actualCsv = api.previewProgramsCsv(api.createProgramsImportCsv(actual), actual)
assert.deepEqual(actualCsv.errors, [])
assert.equal(actualCsv.invalidCount, 0, actualCsv.rows.filter(row => row.status === 'invalid').map(row => `${row.line}: ${row.errors.join('; ')}`).join('\n'))
assert.equal(actualCsv.duplicateCount, actual.programs.length, 'all actual rows survive current-data CSV round-trip validation')
const actualAdded = api.appendPrograms(actual, api.previewManualProgram({ University: '測試大學', 'Program Name': '全新學程', Degree: 'MS' }, actual))
assert.equal(actualAdded.model.programs.length, actual.programs.length + 1)
assert.equal(actualAdded.model.checklist.length, actual.checklist.length + 1)
assert.equal(actualAdded.model.faculty.length, actual.faculty.length)
assert.equal(actualAdded.model.programTimeline.length, actual.programTimeline.length)
assert.deepEqual(actualAdded.model.workbook.SheetNames, actual.workbook.SheetNames)

console.log('PASS: manual and CSV addition, UTF-8/quotes/multiline parsing, strict validation and limits, normalized duplicates, distinct campus/degree identity, stale-preview revalidation, safe formulas, unverified defaults, fresh checklist, full workbook/edit/formula preservation, stable reload IDs, template/prompt, and real-dataset export round-trip.')
