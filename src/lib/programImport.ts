import * as XLSX from 'xlsx'
import type { CellValue, WorkbookModel } from '../types'
import { CHECKLIST_FIELDS, getValue, makeProgramKey, parseWorkbook } from './workbook'

export const PROGRAM_IMPORT_LIMITS = { maxBytes: 5 * 1024 * 1024, maxRows: 500, maxCellLength: 20_000, maxColumns: 200 } as const

export interface ProgramImportField {
  key: string
  label: string
  type: 'text' | 'url' | 'date' | 'number' | 'textarea'
  required?: boolean
}

export const PROGRAM_IMPORT_FIELDS: ProgramImportField[] = [
  { key: 'University', label: '學校名稱', type: 'text', required: true },
  { key: 'Program Name', label: '學程名稱', type: 'text', required: true },
  { key: 'Degree', label: '學位', type: 'text' },
  { key: 'Campus', label: '校區', type: 'text' },
  { key: 'Relevant Research Areas', label: '研究領域', type: 'text' },
  { key: 'Official Program URL', label: '官方學程網址', type: 'url' },
  { key: 'Official Application URL', label: '官方申請網址', type: 'url' },
  { key: 'Application Deadline', label: '申請截止日（待核實）', type: 'date' },
  { key: 'Admissions/Deadline Source URL', label: '截止日來源網址', type: 'url' },
  { key: 'Application Fee USD｜空白待核實', label: '申請費（USD）', type: 'number' },
  { key: 'Required Materials', label: '申請材料', type: 'textarea' },
  { key: 'Requirements Source URL', label: '申請材料來源網址', type: 'url' },
  { key: 'Notes', label: '備註', type: 'textarea' },
]

export interface ProgramImportRow {
  line: number
  university: string
  programName: string
  degree: string
  values: Record<string, CellValue>
  status: 'ready' | 'duplicate' | 'invalid'
  errors: string[]
  warnings: string[]
}

export interface ProgramImportPreview {
  rows: ProgramImportRow[]
  errors: string[]
  warnings: string[]
  readyCount: number
  duplicateCount: number
  invalidCount: number
}

const TEMPLATE_FIELDS = PROGRAM_IMPORT_FIELDS.map(field => field.key)
const IMPORT_METADATA = ['Data Origin', 'Added Date', 'Imported Program Name']
const RESET_FIELDS = new Set([
  'Program ID', 'Application Status', 'Application Complete', 'Decision', 'Response Deadline',
  'Next Action', 'Action Deadline', 'Internal Planning Deadline｜非官方承諾',
  'Last Verified Date', 'Program Identity Verified', 'Requirements Verified', 'Requirement Evidence JSON',
  'Deadline Events JSON', 'Deadline Status', 'Evidence Category', 'Verification Scope / Limit',
  'Personal Desirability Rank', 'Desirability Rank', 'Personal Rank', 'Selection Result',
  'Selection Result Updated', 'Desirability Notes', 'My Competitiveness Category', 'Competitiveness Notes',
  'Classification Last Updated', 'Personal Classification Audit Date', 'Baseline Competitiveness',
  'Enhanced Competitiveness', 'Research Fit Score', 'Research Fit｜原表個人評分', 'Research Fit Reason',
  'Data Origin', 'Added Date', 'Imported Program Name',
])
const ALIASES: Record<string, string> = {
  'Application Fee': 'Application Fee USD｜空白待核實',
  'Deadline Cycle': 'Deadline Cycle / Evidence',
  'Research Fit Score': 'Research Fit｜原表個人評分',
}
const DATE_FIELDS = new Set([
  'Application Deadline', 'Funding Deadline', 'Action Deadline', 'Application Opens',
  'Priority / CMU Fee-Early｜見說明', 'Internal Planning Deadline｜非官方承諾',
])
const NUMBER_FIELDS = new Set([
  'Application Fee USD｜空白待核實', 'Tuition Amount USD', 'Recommendation Letters',
  'Internal Submit Buffer Days', 'Time-Zone Offset to Taipei (days)',
])
const URL_FIELDS = new Set(['English Official Source', 'Additional English Source', 'Additional Identity Source'])
const formulaText = /^[\s\uFEFF]*[=+@-]/u

function normalized(value: unknown): string {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US')
}

function identityName(university: string, program: string): string {
  // Match the existing UCSD alias without changing any existing document/checklist keys.
  const school = normalized(university) === normalized('University of California, San Diego')
    ? 'University of California, San Diego' : university
  const name = normalized(program) === normalized('MS Computer Science (CS75)')
    ? 'MS Computer Science (CS75)' : program
  return normalized(makeProgramKey(school, name).split('|||').slice(1).join('|||'))
}

function headerNames(model: WorkbookModel): string[] {
  const sheet = model.workbook.Sheets.Programs
  if (!sheet?.['!ref']) return []
  const range = XLSX.utils.decode_range(sheet['!ref'])
  return Array.from({ length: range.e.c - range.s.c + 1 }, (_, index) =>
    String(sheet[XLSX.utils.encode_cell({ r: range.s.r, c: range.s.c + index })]?.v ?? '').trim(),
  ).filter(Boolean)
}

function allowedHeaders(model: WorkbookModel): Map<string, string> {
  const entries = [...headerNames(model), ...TEMPLATE_FIELDS, ...IMPORT_METADATA, ...RESET_FIELDS]
  const result = new Map(entries.map(field => [normalized(field), field]))
  Object.entries(ALIASES).forEach(([alias, field]) => result.set(normalized(alias), field))
  return result
}

function previewResult(rows: ProgramImportRow[], errors: string[] = [], warnings: string[] = []): ProgramImportPreview {
  return {
    rows, errors, warnings,
    readyCount: rows.filter(row => row.status === 'ready').length,
    duplicateCount: rows.filter(row => row.status === 'duplicate').length,
    invalidCount: rows.filter(row => row.status === 'invalid').length,
  }
}

interface CsvRecord { line: number; cells: string[] }

/** A bounded RFC 4180 parser. It never evaluates cells or guesses their types. */
function parseCsv(text: string): CsvRecord[] {
  const records: CsvRecord[] = []
  let cells: string[] = [], value = '', quoted = false, closedQuote = false, line = 1, startLine = 1
  const pushCell = () => {
    if (value.length > PROGRAM_IMPORT_LIMITS.maxCellLength) throw new Error(`第 ${startLine} 行有欄位超過 20,000 字元。`)
    cells.push(value)
    if (cells.length > PROGRAM_IMPORT_LIMITS.maxColumns) throw new Error('CSV 最多可有 200 個欄位。')
    value = ''; closedQuote = false
  }
  const pushRecord = () => {
    pushCell()
    if (cells.some(cell => cell.trim())) records.push({ line: startLine, cells })
    if (records.length > PROGRAM_IMPORT_LIMITS.maxRows + 1) throw new Error('一次最多新增 500 個學程，請拆成多個 CSV。')
    cells = []; startLine = line + 1
  }
  const source = text.replace(/^\uFEFF/, '')
  if (source.includes('\0') || source.includes('\uFFFD')) throw new Error('檔案含無法辨識的字元，請另存為 UTF-8 CSV。')
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') { value += '"'; index += 1 }
        else { quoted = false; closedQuote = true }
      } else if (char === '\r' || char === '\n') {
        value += '\n'; line += 1
        if (char === '\r' && source[index + 1] === '\n') index += 1
      } else value += char
    } else if (char === ',') pushCell()
    else if (char === '\r' || char === '\n') {
      pushRecord(); line += 1
      if (char === '\r' && source[index + 1] === '\n') index += 1
    } else if (char === '"') {
      if (value || closedQuote) throw new Error(`第 ${line} 行的雙引號格式不正確，含逗號或換行的文字需整格以雙引號包住。`)
      quoted = true
    } else {
      if (closedQuote && !/^[ \t]$/.test(char)) throw new Error(`第 ${line} 行的引號後只能接逗號或換行。`)
      if (!closedQuote) value += char
    }
    if (value.length > PROGRAM_IMPORT_LIMITS.maxCellLength) throw new Error(`第 ${startLine} 行有欄位超過 20,000 字元。`)
  }
  if (quoted) throw new Error(`第 ${startLine} 行有未關閉的雙引號。`)
  if (value || cells.length || closedQuote) pushRecord()
  return records
}

function calendarDate(value: string): Date | null {
  // Accept the existing Excel CSV export's M/D/YY spelling as well as the template's ISO date.
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const excel = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(value)
  if (!iso && !excel) return null
  const year = iso ? Number(iso[1]) : Number(excel![3]) + (excel![3]!.length === 2 ? 2000 : 0)
  const month = Number(iso ? iso[2] : excel![1]), day = Number(iso ? iso[3] : excel![2])
  if (year < 1900 || year > 2200) return null
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null
}

interface Identity { university: string; name: string; original: string; degree: string; campus: string }

function identity(values: Record<string, CellValue>): Identity {
  const university = String(values.University ?? '')
  const name = String(values['Program Name'] ?? '')
  return {
    university: normalized(university), name: identityName(university, name),
    original: identityName(university, String(values['Imported Program Name'] || name)),
    degree: normalized(values.Degree), campus: normalized(values.Campus),
  }
}

function sameIdentity(left: Identity, right: Identity): boolean {
  return left.university === right.university
    && (left.name === right.name || left.original === right.original)
    && (!left.degree || !right.degree || left.degree === right.degree)
    && (!left.campus || !right.campus || left.campus === right.campus)
}

function cellText(value: CellValue): string {
  if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  return value == null ? '' : String(value)
}

function previewRecords(records: { line: number; values: Record<string, CellValue> }[], model: WorkbookModel): ProgramImportPreview {
  if (records.length > PROGRAM_IMPORT_LIMITS.maxRows) return previewResult([], ['一次最多新增 500 個學程。'])
  const identities = model.programs.map(row => identity(row.values))
  const rows: ProgramImportRow[] = []
  for (const record of records) {
    const identityValues = Object.fromEntries(['University', 'Program Name', 'Degree', 'Campus'].map(key => {
      let text = cellText(record.values[key] ?? null).trim()
      if (text.startsWith("'") && formulaText.test(text.slice(1))) text = text.slice(1)
      return [key, text]
    }))
    // A full export contains historical free-form dates and costs. Existing identities are
    // skipped before value validation because none of their supplied fields will be written.
    // New identities still undergo every validation below.
    if (identityValues.University && identityValues['Program Name'] && identities.some(existing => sameIdentity(existing, identity(identityValues)))) {
      rows.push({
        line: record.line, values: identityValues, university: identityValues.University,
        programName: identityValues['Program Name'], degree: identityValues.Degree ?? '',
        status: 'duplicate', errors: [], warnings: ['相同學程已存在，這一列會略過，既有內容不會被覆蓋。'],
      })
      continue
    }
    const errors: string[] = [], warnings: string[] = [], values: Record<string, CellValue> = {}
    const discarded: string[] = []
    for (const [key, raw] of Object.entries(record.values)) {
      let text = cellText(raw).trim()
      if (!text) continue
      if (text.length > PROGRAM_IMPORT_LIMITS.maxCellLength) { errors.push(`「${key}」超過 20,000 字元。`); continue }
      if (RESET_FIELDS.has(key)) { discarded.push(key); continue }
      if (DATE_FIELDS.has(key)) {
        const date = calendarDate(text)
        if (!date) errors.push(`「${key}」需為有效日期（YYYY-MM-DD），例如 2027-01-15。`)
        else values[key] = date
      } else if (NUMBER_FIELDS.has(key)) {
        const number = Number(text)
        if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text) || !Number.isFinite(number)) errors.push(`「${key}」需為有限數字。`)
        else if (number < 0 && key !== 'Time-Zone Offset to Taipei (days)') errors.push(`「${key}」不能為負數。`)
        else if (key === 'Recommendation Letters' && (!Number.isInteger(number) || number > 20)) errors.push('推薦信數量需為 0 至 20 的整數。')
        else values[key] = number
      } else if (/URL$/i.test(key) || URL_FIELDS.has(key)) {
        try {
          const url = new URL(text)
          if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password || /[\r\n\t]/.test(text)) throw new Error()
          values[key] = url.href
        } catch { errors.push(`「${key}」需為完整的 http:// 或 https:// 網址。`) }
      } else {
        // Undo only our CSV formula protection; XLSX cells are always explicitly stored as text.
        if (text.startsWith("'") && formulaText.test(text.slice(1))) text = text.slice(1)
        if (formulaText.test(text)) warnings.push(`「${key}」以純文字儲存，不會執行公式。`)
        values[key] = text
      }
    }
    if (discarded.length) warnings.push('匯出的進度、選校排序與查核標記不會沿用；新增學程會從待核實、未開始準備。')
    for (const key of ['University', 'Program Name']) {
      if (!values[key]) errors.push(`請填寫 ${key === 'University' ? '學校名稱（University）' : '學程名稱（Program Name）'}。`)
      else if (String(values[key]).length > 300 || /[\r\n\t]|\|\|\|/.test(String(values[key]))) errors.push(`「${key}」最多 300 字元，且不可含換行、Tab 或 |||。`)
    }
    for (const key of ['Degree', 'Campus']) {
      if (values[key] && (String(values[key]).length > 160 || /[\r\n\t]|\|\|\|/.test(String(values[key])))) errors.push(`「${key}」最多 160 字元，且不可含換行、Tab 或 |||。`)
    }
    if (!values.Degree) warnings.push('學位尚未填寫，之後可在學程內補上。')
    if (!values['Official Program URL']) warnings.push('尚無官方學程網址，新增後請補上來源並核對資料。')
    if (values['Application Deadline'] && !values['Admissions/Deadline Source URL']) warnings.push('截止日沒有來源網址，請在送出申請前確認校方公告。')
    const current = identity(values)
    const duplicate = identities.some(existing => sameIdentity(existing, current))
    if (duplicate) warnings.push('相同學程已存在，這一列會略過，既有內容不會被覆蓋。')
    if (!duplicate && identities.some(existing => existing.university === current.university && existing.name === current.name)) {
      const originalName = String(values['Program Name'])
      const detail = [values.Degree, values.Campus].filter(Boolean).join(' · ')
      const baseName = `${originalName} (${detail})`
      let uniqueName = baseName, suffix = 2
      while (identities.some(existing => existing.university === current.university && existing.name === identityName(String(values.University), uniqueName))) uniqueName = `${baseName} ${suffix++}`
      values['Program Name'] = uniqueName
      values['Imported Program Name'] = originalName
      warnings.push(`為區分相同名稱的學位或校區，新增名稱為「${uniqueName}」。`)
      if (uniqueName.length > 300) errors.push('加上學位／校區後的學程名稱超過 300 字元，請縮短名稱。')
    }
    const row: ProgramImportRow = {
      line: record.line, values, university: String(values.University ?? ''),
      programName: String(values['Program Name'] ?? ''), degree: String(values.Degree ?? ''),
      status: errors.length ? 'invalid' : duplicate ? 'duplicate' : 'ready', errors, warnings,
    }
    rows.push(row)
    if (row.status === 'ready') identities.push(identity(values))
  }
  return previewResult(rows)
}

export function previewManualProgram(values: Record<string, string>, model: WorkbookModel): ProgramImportPreview {
  const allowed = allowedHeaders(model)
  const canonical = Object.fromEntries(Object.entries(values).flatMap(([key, value]) => {
    const header = allowed.get(normalized(key))
    return header ? [[header, value]] : []
  }))
  return previewRecords([{ line: 1, values: canonical }], model)
}

export function previewProgramsCsv(text: string, model: WorkbookModel): ProgramImportPreview {
  if (new TextEncoder().encode(text).byteLength > PROGRAM_IMPORT_LIMITS.maxBytes) return previewResult([], ['CSV 超過 5 MB，請拆成較小的檔案。'])
  let records: CsvRecord[]
  try { records = parseCsv(text) } catch (error) { return previewResult([], [error instanceof Error ? error.message : '無法讀取 CSV。']) }
  const headerRow = records.shift()
  if (!headerRow) return previewResult([], ['CSV 是空的，請先下載範本並填入學程。'])
  const allowed = allowedHeaders(model), seen = new Set<string>(), errors: string[] = [], ignored: string[] = []
  const headers = headerRow.cells.map(raw => {
    const header = allowed.get(normalized(raw))
    const key = normalized(header ?? raw)
    if (!key) errors.push('CSV 有空白欄位名稱，請移除多餘欄位。')
    else if (seen.has(key)) errors.push(`CSV 重複欄位「${raw.trim()}」，請只保留一欄。`)
    seen.add(key)
    if (!header && raw.trim()) ignored.push(raw.trim())
    return header
  })
  for (const required of ['University', 'Program Name']) if (!headers.includes(required)) errors.push(`CSV 缺少必要欄位「${required}」。請使用 Easier 範本。`)
  if (errors.length) return previewResult([], errors)
  if (!records.length) return previewResult([], ['CSV 只有標題，請至少填入一個學程。'])
  const good: { line: number; values: Record<string, CellValue> }[] = [], malformed: ProgramImportRow[] = []
  for (const record of records) {
    if (record.cells.length !== headers.length) {
      malformed.push({ line: record.line, values: {}, university: '', programName: '', degree: '', status: 'invalid', errors: [`此列有 ${record.cells.length} 格，但標題有 ${headers.length} 欄。請檢查逗號及雙引號。`], warnings: [] })
      continue
    }
    good.push({ line: record.line, values: Object.fromEntries(headers.flatMap((header, index) => header ? [[header, record.cells[index] ?? '']] : [])) })
  }
  const validated = previewRecords(good, model)
  return previewResult([...validated.rows, ...malformed].sort((a, b) => a.line - b.line), validated.errors, ignored.length ? [`以下欄位未使用：${ignored.join('、')}。其他已辨識欄位仍會匯入。`] : [])
}

function appendRows(workbook: XLSX.WorkBook, name: string, rows: Record<string, CellValue>[], requiredHeaders: string[]): void {
  let sheet = workbook.Sheets[name]
  if (!sheet?.['!ref']) {
    sheet = XLSX.utils.aoa_to_sheet([requiredHeaders])
    workbook.Sheets[name] = sheet
    if (!workbook.SheetNames.includes(name)) workbook.SheetNames.push(name)
  }
  const range = XLSX.utils.decode_range(sheet['!ref']!)
  const columns = new Map<string, number>()
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const header = String(sheet[XLSX.utils.encode_cell({ r: range.s.r, c: column })]?.v ?? '').trim()
    if (header) columns.set(header, column)
  }
  const fields = [...new Set([...requiredHeaders, ...rows.flatMap(row => Object.keys(row))])]
  for (const field of fields) if (!columns.has(field)) {
    const column = ++range.e.c
    sheet[XLSX.utils.encode_cell({ r: range.s.r, c: column })] = { t: 's', v: field }
    columns.set(field, column)
  }
  for (const row of rows) {
    const rowIndex = ++range.e.r
    for (const [field, value] of Object.entries(row)) {
      if (value == null || value === '') continue
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columns.get(field)! })
      sheet[address] = value instanceof Date ? { t: 'd', v: value, z: 'yyyy-mm-dd' }
        : typeof value === 'number' ? { t: 'n', v: value }
          : typeof value === 'boolean' ? { t: 'b', v: value } : { t: 's', v: value }
    }
  }
  sheet['!ref'] = XLSX.utils.encode_range(range)
}

/** Revalidates against the latest edited workbook, then creates one new snapshot without mutating the source. */
export function appendPrograms(model: WorkbookModel, preview: ProgramImportPreview): { buffer: ArrayBuffer; model: WorkbookModel; addedIds: string[] } {
  if (preview.errors.length) throw new Error(preview.errors.join('\n'))
  if (preview.invalidCount || preview.rows.some(row => row.status === 'invalid')) throw new Error('請先修正格式有誤的列，再重新預覽。這次沒有新增任何資料。')
  const records = preview.rows.filter(row => row.status === 'ready').map(row => ({
    line: row.line,
    // Recheck the original identity; another import may have added this campus since preview.
    values: { ...row.values, 'Program Name': row.values['Imported Program Name'] || row.programName },
  }))
  const checked = previewRecords(records, model)
  if (checked.errors.length || checked.invalidCount) throw new Error('資料已變更或格式不正確，請重新預覽後再新增。')
  const ready = checked.rows.filter(row => row.status === 'ready')
  if (!ready.length) throw new Error('沒有可新增的學程；相同學程可能已經存在。')
  const workbook = structuredClone(model.workbook), addedAt = new Date()
  const programRows = ready.map(row => ({
    ...row.values,
    'Imported Program Name': row.values['Imported Program Name'] ?? row.programName,
    'Program ID': makeProgramKey(row.university, row.programName),
    'Application Status': 'Researching', 'Application Complete': 'No',
    'Selection Result': '未分類', 'My Competitiveness Category': '資料不足',
    'Deadline Status': 'unverified', 'Evidence Category': '使用者新增／待核實',
    'Verification Scope / Limit': '由使用者手動新增或匯入；網址、日期與申請要求尚未經 Easier 查核。',
    'Data Origin': '使用者新增', 'Added Date': addedAt,
    'Next Action': '核對官方學程與本輪申請要求',
  }))
  appendRows(workbook, 'Programs', programRows, [...TEMPLATE_FIELDS, ...IMPORT_METADATA])
  const checklistRows = ready.map(row => ({
    University: row.university, Program: row.programName,
    ...Object.fromEntries(CHECKLIST_FIELDS.map(field => [field, 'Not started'])),
    'Next Action': '先確認本輪申請材料，再更新個人準備進度',
    'Current Blocker': '學程及申請要求待核實',
  }))
  appendRows(workbook, 'Application Checklist', checklistRows, ['University', 'Program', ...CHECKLIST_FIELDS, 'Target Date', 'Next Action'])
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', cellStyles: true, compression: true }) as ArrayBuffer
  return { buffer, model: parseWorkbook(buffer), addedIds: ready.map(row => makeProgramKey(row.university, row.programName)) }
}

function csvCell(value: CellValue): string {
  let text = cellText(value)
  if (typeof value === 'string' && formulaText.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export function createProgramTemplateCsv(): string {
  return `\uFEFF${TEMPLATE_FIELDS.map(csvCell).join(',')}\r\n`
}

/** An editable export of the current Programs values, including changes not yet present in the source file. */
export function createProgramsImportCsv(model: WorkbookModel): string {
  const headers = headerNames(model)
  return '\uFEFF' + [headers.map(csvCell).join(','), ...model.programs.map(row => headers.map(field => csvCell(getValue(row, field))).join(','))].join('\r\n') + '\r\n'
}

export const PROGRAM_IMPORT_PROMPT = `請幫我整理要新增至 Easier 的研究所學程，最後輸出 UTF-8 CSV，讓我下載或複製為 .csv 檔案。

我想新增的學程與申請年度：［請填寫學校、學程、學位、校區與申請年度］

CSV 標題請原樣使用：
${TEMPLATE_FIELDS.map(csvCell).join(',')}

要求：
1. 一列一個學程。University、Program Name 必填；Degree 與 Campus 請盡量補上，學位、校區、線上／實體不同時要明確區分名稱。不要改動已有學程；Easier 只新增、會略過重複列。
2. 使用學校官方學程／招生網站查詢，提供完整 https:// 來源。不要猜測日期、費用、材料或政策，找不到就留空並在 Notes 註明缺口及適用年度。
3. Application Deadline 只填所指定年度已明確公布的 YYYY-MM-DD 日期，並附 Admissions/Deadline Source URL；未公布或只有舊年度資料就留空，在 Notes 說明。
4. Application Fee USD｜空白待核實 只填以美元計價的純數字，其他幣別及適用條件寫入 Notes；不要自行換算。Requirements Source URL 請附申請材料的官方來源。
5. 不要輸出任何 Excel 公式、HTML、Markdown 表格或程式碼圍欄。含逗號、雙引號或換行的欄位需以雙引號包住，欄位內雙引號寫成兩個雙引號。每列欄數必須一致。
6. 未知值請留空，不要用「N/A」代替日期、網址或數字。不需填寫查核狀態、個人排序、申請進度或其他人的備註。匯入後所有新資料都會標為「使用者新增／待核實」。
7. 若我提供目前的 CSV，請把它當作已收錄清單用來避開重複，只輸出新增學程的列與上述標題。一次最多 500 個學程、檔案最多 5 MB。
`
