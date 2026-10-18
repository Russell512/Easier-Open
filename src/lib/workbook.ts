import * as XLSX from 'xlsx'
import type {
  CellEdit,
  CellValue,
  DataRow,
  PersistedTracker,
  ProgramView,
  SchoolSelectionState,
  SerializedValue,
  SheetSummary,
  WorkbookModel,
} from '../types'

export const DEFAULT_FILE_NAME = 'update_info.xlsx'
export const DEFAULT_WORKBOOK_URL = `./data/${DEFAULT_FILE_NAME}`
export const STORAGE_KEY = 'fall-2027-grad-tracker-v1'
export const PRE_UPDATE_BACKUP_KEY = `${STORAGE_KEY}-before-update-info`
export const LEGACY_DEFAULT_FILES: string[] = []

// UI aliases only. Keep source headers, cells, formulas and auxiliary sheets intact.
const FIELD_ALIASES: Record<string, Record<string, string>> = {
  Programs: {
    'Research Fit Score': 'Research Fit｜原表個人評分',
    'Number of Relevant Faculty': '本表未排除候選數｜非保證可指導',
    'Deadline Cycle': 'Deadline Cycle / Evidence',
    'Application Fee': 'Application Fee USD｜空白待核實',
    'Classification Last Updated': 'Personal Classification Audit Date',
  },
  Faculty: { '3–5 Relevant Recent Papers': '閱讀主題／書目核對狀態', 'Last Verified Date': 'Checked On' },
  'Per-Program Timeline': {
    'Official Deadline': 'Official External Date｜未公布留白',
    'My Target Deadline': 'My Target｜內部規劃',
    'Days of Buffer': 'Buffer Days｜僅有官方日才計',
    'Responsible Person': 'Owner', 'Status': 'Status｜沿用原進度',
    'Source': 'Official Source', 'Notes': 'Rule / Caution',
  },
  'Master Timeline': {
    'Start Date': 'Start｜內部', 'Target Completion Date': 'Target｜內部',
    'Hard Deadline': 'First Relevant Official Deadline', 'Dependencies': 'Dependency',
    'Related Programs': 'Scope', 'Risk／Buffer': 'Risk / Buffer',
  },
}

export function isChecklistDone(value: CellValue | undefined): boolean {
  return /^(Completed|Verified|Not needed)(?:$|\s*\/)/i.test(String(value ?? ''))
}

export function checklistProgress(row?: DataRow) {
  const fields = CHECKLIST_FIELDS.filter((field) => field in (row?.values ?? {}))
  // Not-required items are excluded, so they cannot inflate actual preparation progress.
  const required = fields.filter((field) => !/^Not needed(?:$|\s*\/)/i.test(String(getValue(row, field) ?? '')))
  const done = required.filter((field) => isChecklistDone(getValue(row, field))).length
  return { done, total: required.length, percent: required.length ? Math.round(done / required.length * 100) : 0 }
}

export const CHECKLIST_STATUSES = [
  'Not needed',
  'Not started',
  'In progress',
  'Waiting on others',
  'Completed',
  'Verified',
] as const

export function checklistStatuses(field: string, current = ''): string[] {
  return [...new Set(['', ...(field === 'GRE' ? ['Required'] : []), ...CHECKLIST_STATUSES, current])]
}

export const CHECKLIST_FIELDS = [
  'Application Account',
  'CV',
  'Base SOP',
  'School-specific SOP',
  'Personal Statement',
  'Transcript',
  'TOEFL',
  'IELTS',
  'GRE',
  'Recommendation 1',
  'Recommendation 2',
  'Recommendation 3',
  'Writing Sample',
  'Research Proposal',
  'Faculty Contact',
  'Fee Waiver',
  'Application Fee',
  'Application Submitted',
  'Supporting Documents Received',
  'Application Verified Complete',
  'Interview',
  'Decision',
] as const

export const PROGRAM_STATUS_ORDER = [
  'Researching',
  'Shortlisted',
  'Preparing',
  'Submitted',
  'Interview',
  'Admitted',
  'Rejected',
  'Withdrawn',
]

const MAIN_SHEETS = [
  'Programs',
  'Faculty',
  'Application Checklist',
  'Per-Program Timeline',
  'Master Timeline',
] as const

function normalizeCellValue(value: unknown): CellValue {
  if (value === undefined || value === null) return null
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  return String(value)
}

export function displayValue(value: CellValue | undefined): string {
  if (value === null || value === undefined || value === '') return 'Unknown'
  if (value instanceof Date) return formatDate(value)
  return String(value)
}

export function formatDate(value: CellValue | undefined): string {
  if (!value) return 'Unknown'
  const date = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function toDateInput(value: CellValue | undefined): string {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function makeProgramKey(university: CellValue | undefined, program: CellValue | undefined): string {
  return `${displayValue(university)}|||${identityProgramName(university, program)}`
}

// Retain the existing workspace/document identity when correcting UCSD's department-level label.
function identityProgramName(university: CellValue | undefined, program: CellValue | undefined): string {
  const name = displayValue(program)
  return university === 'University of California, San Diego' && name === 'MS Computer Science (CS75)'
    ? 'MS Computer Science and Engineering' : name
}

export function getValue(row: DataRow | undefined, field: string): CellValue {
  return row?.values[field] ?? null
}

export function programSearchText(program: ProgramView): string {
  return `${program.university} ${program.programName} ${program.researchAreas} ${getValue(program.row, 'Program Code') ?? ''} ${getValue(program.row, 'Search Aliases') ?? ''}`.toLowerCase()
}

function sheetRows(workbook: XLSX.WorkBook, sheetName: string): DataRow[] {
  const worksheet = workbook.Sheets[sheetName]
  if (!worksheet?.['!ref']) return []
  const range = XLSX.utils.decode_range(worksheet['!ref'])
  const headers: string[] = []
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const cell = worksheet[XLSX.utils.encode_cell({ r: range.s.r, c: column })]
    const header = cell?.v == null ? '' : String(cell.v).trim()
    headers.push(header || `__blank_column_${column + 1}`)
  }

  const rows: DataRow[] = []
  for (let rowIndex = range.s.r + 1; rowIndex <= range.e.r; rowIndex += 1) {
    const values: Record<string, CellValue> = {}
    let hasValue = false
    headers.forEach((header, index) => {
      const cell = worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: range.s.c + index })]
      const value = normalizeCellValue(cell?.v)
      values[header] = value
      if (value !== null && value !== '') hasValue = true
    })
    if (hasValue) {
      Object.entries(FIELD_ALIASES[sheetName] ?? {}).forEach(([alias, original]) => {
        if (!(alias in values) && original in values) values[alias] = values[original] ?? null
      })
      rows.push({
        __sheet: sheetName,
        __row: rowIndex,
        __id: `${sheetName}:${rowIndex}`,
        values,
      })
    }
  }
  return rows
}

function summarizeSheets(workbook: XLSX.WorkBook): SheetSummary[] {
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name]
    if (!sheet?.['!ref']) return { name, rows: 0, columns: 0, headers: [] }
    const range = XLSX.utils.decode_range(sheet['!ref'])
    const headers: string[] = []
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const value = sheet[XLSX.utils.encode_cell({ r: range.s.r, c: column })]?.v
      headers.push(value == null ? '' : String(value))
    }
    return {
      name,
      rows: range.e.r - range.s.r + 1,
      columns: range.e.c - range.s.c + 1,
      headers,
    }
  })
}

function missingFields(rows: DataRow[], sheet: string, fields: string[], templateHeaders?: string[]): string[] {
  if (!rows.length && !templateHeaders) return [`缺少或無法解析 sheet：${sheet}`]
  const present = rows[0]?.values ?? Object.fromEntries((templateHeaders ?? []).map(header => [header, null]))
  return fields
    .filter((field) => !(field in present))
    .map((field) => `${sheet} 缺少欄位「${field}」`)
}

function collectWarnings(workbook: XLSX.WorkBook, data: Record<string, DataRow[]>): string[] {
  const warnings: string[] = []
  const template = workbook.Sheets['Easier Template']?.A2?.v
  const summaries = ['easier-empty-v1', 'easier-demo-v1'].includes(String(template)) ? summarizeSheets(workbook) : []
  const templateHeaders = (name: string) => summaries.find(sheet => sheet.name === name)?.headers
  MAIN_SHEETS.forEach((sheet) => {
    if (!workbook.SheetNames.includes(sheet)) warnings.push(`Workbook 缺少必要 sheet「${sheet}」`)
  })
  warnings.push(
    ...missingFields(data.Programs ?? [], 'Programs', [
      'University',
      'Program Name',
      'Degree',
      'Application Deadline',
      'Application Status',
      'Research Fit Score',
      'Next Action',
    ], templateHeaders('Programs')),
    ...missingFields(data.Faculty ?? [], 'Faculty', ['University', 'Program', 'Faculty Name'], templateHeaders('Faculty')),
    ...missingFields(data['Application Checklist'] ?? [], 'Application Checklist', [
      'University',
      'Program',
    ], templateHeaders('Application Checklist')),
  )

  const faculty = data.Faculty?.[0]?.values ?? Object.fromEntries((templateHeaders('Faculty') ?? []).map(header => [header, null]))
  ;['Last Verified Date'].forEach((field) => {
    if (!(field in faculty)) warnings.push(`Faculty 沒有獨立「${field}」欄；相關資訊僅在現有欄位中顯示。`)
  })
  return [...new Set(warnings)]
}

export function parseWorkbook(buffer: ArrayBuffer, edits: CellEdit[] = []): WorkbookModel {
  const workbook = XLSX.read(buffer, {
    type: 'array',
    cellDates: true,
    cellFormula: true,
    cellStyles: true,
  })
  applyEdits(workbook, edits)
  return modelFromWorkbook(workbook)
}

function modelFromWorkbook(workbook: XLSX.WorkBook): WorkbookModel {
  const data: Record<string, DataRow[]> = {}
  MAIN_SHEETS.forEach((sheetName) => {
    data[sheetName] = sheetRows(workbook, sheetName)
  })
  return {
    workbook,
    programs: data.Programs ?? [],
    faculty: data.Faculty ?? [],
    checklist: data['Application Checklist'] ?? [],
    programTimeline: data['Per-Program Timeline'] ?? [],
    masterTimeline: data['Master Timeline'] ?? [],
    sheetSummaries: summarizeSheets(workbook),
    warnings: collectWarnings(workbook, data),
  }
}

/** Reuse the parsed source; clone only edited sheets/cells instead of unzipping Excel on every keystroke. */
export function editWorkbookModel(source: WorkbookModel, edits: CellEdit[]): WorkbookModel {
  if (!edits.length) return source
  const workbook = { ...source.workbook, Sheets: { ...source.workbook.Sheets } }
  new Set(edits.map((edit) => edit.sheet)).forEach((sheet) => {
    if (workbook.Sheets[sheet]) workbook.Sheets[sheet] = { ...workbook.Sheets[sheet] }
  })
  edits.forEach((edit) => {
    const sheet = workbook.Sheets[edit.sheet]
    if (sheet?.[edit.address]) sheet[edit.address] = { ...sheet[edit.address] }
  })
  applyEdits(workbook, edits)
  return modelFromWorkbook(workbook)
}

export function buildProgramViews(model: WorkbookModel): ProgramView[] {
  const checklistByKey = new Map(
    model.checklist.map((row) => [makeProgramKey(getValue(row, 'University'), getValue(row, 'Program')), row]),
  )
  const timelinesByKey = new Map<string, DataRow[]>()
  model.programTimeline.forEach((row) => {
    const key = makeProgramKey(getValue(row, 'University'), getValue(row, 'Program'))
    timelinesByKey.set(key, [...(timelinesByKey.get(key) ?? []), row])
  })

  return model.programs.map((row) => {
    const key = makeProgramKey(getValue(row, 'University'), getValue(row, 'Program Name'))
    const checklistRow = checklistByKey.get(key)
    const completion = checklistProgress(checklistRow).percent
    const activeTargets = (timelinesByKey.get(key) ?? [])
      .filter((item) => !isChecklistDone(getValue(item, 'Status')))
      .map((item) => getValue(item, 'My Target Deadline'))
      .filter((value): value is Date => value instanceof Date)
      .sort((a, b) => a.getTime() - b.getTime())
    return {
      id: key,
      row,
      university: displayValue(getValue(row, 'University')),
      programName: displayValue(getValue(row, 'Program Name')),
      degree: displayValue(getValue(row, 'Degree')),
      status: displayValue(getValue(row, 'Application Status')),
      deadline: getValue(row, 'Application Deadline'),
      targetDeadline: activeTargets[0] ?? getValue(checklistRow, 'Target Date'),
      researchFitScore: getValue(row, 'Research Fit Score'),
      competitiveness: displayValue(
        getValue(row, 'Enhanced Competitiveness') ?? getValue(row, 'Baseline Competitiveness'),
      ),
      nextAction: displayValue(getValue(row, 'Next Action')),
      researchAreas: displayValue(getValue(row, 'Relevant Research Areas')),
      completion,
      checklistRow,
    }
  })
}

export function makeEdit(
  workbook: XLSX.WorkBook,
  row: DataRow,
  field: string,
  value: CellValue,
): CellEdit | null {
  const worksheet = workbook.Sheets[row.__sheet]
  if (!worksheet?.['!ref']) return null
  const range = XLSX.utils.decode_range(worksheet['!ref'])
  let column = -1
  for (let current = range.s.c; current <= range.e.c; current += 1) {
    const header = worksheet[XLSX.utils.encode_cell({ r: range.s.r, c: current })]?.v
    if (String(header ?? '').trim() === field || String(header ?? '').trim() === FIELD_ALIASES[row.__sheet]?.[field]) {
      column = current
      break
    }
  }
  if (column < 0) return null
  return {
    sheet: row.__sheet,
    address: XLSX.utils.encode_cell({ r: row.__row, c: column }),
    value: serializeValue(value),
    updatedAt: new Date().toISOString(),
  }
}

/** Rebase explicit user edits by entity and header, never by old cell position. */
export function migrateWorkbookEdits(previous: WorkbookModel, next: WorkbookModel, edits: CellEdit[]) {
  const migrated: CellEdit[] = []
  const unresolved: CellEdit[] = []
  const rows = (model: WorkbookModel, sheet: string) => sheetRows(model.workbook, sheet)
  const taskRenames: Record<string, string> = {
    '確認 program requirements': '核對本輪申請材料／portal',
    '確認 faculty': '核對faculty現職及讀paper',
    '決定是否寄 faculty email': '決定是否聯絡faculty',
    'TOEFL 最晚考試日期': '英語考試／送分內部最晚目標',
    'GRE 最晚考試日期': 'GRE策略及考試（若適用）',
    '推薦人確認日期': '確認推薦人', '推薦信材料提供日期': '寄推薦材料包',
    'Base SOP 完成日期': '完成Base SOP', 'School-specific SOP 初稿日期': '完成School SOP初稿',
    'SOP 最終版日期': 'School SOP終稿及proofread',
    'Transcript 申請日期': '申請英文成績單／grading scale',
    'Fee waiver 申請日期': '檢查申請費減免资格',
    'Application target submission date': '提早送出申請（內部目標）',
    'Official application deadline': '正式申請截止',
    'Supporting documents verification': '核對所有supporting docs已收到',
    'Interview preparation': '面試准备（若收到邀請）',
    'Decision period': '查看decision／資助條件',
    'Offer response deadline': 'Offer回覆期限（以個別信件為準）',
  }
  const identity = (row: DataRow) => {
    const fields = row.__sheet === 'Programs' ? ['University', 'Program Name']
      : row.__sheet === 'Faculty' ? ['University', 'Program', 'Faculty Name']
      : row.__sheet === 'Application Checklist' ? ['University', 'Program']
      : row.__sheet === 'Per-Program Timeline' ? ['University', 'Program', 'Task']
      : row.__sheet === 'Master Timeline' ? ['Task'] : []
    return fields.length ? JSON.stringify(fields.map((field) => {
      const value = getValue(row, field)
      if (field === 'Program' || field === 'Program Name') return identityProgramName(getValue(row, 'University'), value)
      return row.__sheet === 'Per-Program Timeline' && field === 'Task' ? taskRenames[String(value)] ?? value : value
    })) : null
  }
  edits.forEach((edit) => {
    const cell = XLSX.utils.decode_cell(edit.address)
    const sheet = previous.workbook.Sheets[edit.sheet]
    if (!sheet?.['!ref']) { unresolved.push(edit); return }
    const headerRow = XLSX.utils.decode_range(sheet['!ref']).s.r
    const field = String(sheet[XLSX.utils.encode_cell({ r: headerRow, c: cell.c })]?.v ?? '').trim()
    const oldRow = rows(previous, edit.sheet).find((row) => row.__row === cell.r)
    const key = oldRow && identity(oldRow)
    const matches = key ? rows(next, edit.sheet).filter((row) => identity(row) === key) : []
    const canonical = Object.entries(FIELD_ALIASES[edit.sheet] ?? {}).find(([, original]) => original === field)?.[0] ?? field
    const replacement = matches.length === 1 ? makeEdit(next.workbook, matches[0]!, canonical, deserializeValue(edit.value)) : null
    if (replacement) migrated.push({ ...replacement, updatedAt: edit.updatedAt })
    else unresolved.push(edit)
  })
  return { edits: migrated, unresolved }
}

export function applyEdits(workbook: XLSX.WorkBook, edits: CellEdit[]): void {
  edits.forEach((edit) => {
    const worksheet = workbook.Sheets[edit.sheet]
    if (!worksheet) return
    const value = deserializeValue(edit.value)
    const existing = worksheet[edit.address] ?? {}
    delete existing.f
    existing.v = value
    existing.t = value instanceof Date ? 'd' : typeof value === 'number' ? 'n' : typeof value === 'boolean' ? 'b' : 's'
    if (value === null || value === '') delete worksheet[edit.address]
    else worksheet[edit.address] = existing
  })
}

export function serializeValue(value: CellValue): SerializedValue {
  if (value === null) return { kind: 'null', value: null }
  if (value instanceof Date) return { kind: 'date', value: value.toISOString() }
  if (typeof value === 'number') return { kind: 'number', value }
  if (typeof value === 'boolean') return { kind: 'boolean', value }
  return { kind: 'string', value }
}

export function deserializeValue(value: SerializedValue): CellValue {
  if (value.kind === 'null') return null
  if (value.kind === 'date') return new Date(String(value.value))
  if (value.kind === 'number') return Number(value.value)
  if (value.kind === 'boolean') return Boolean(value.value)
  return String(value.value ?? '')
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes.buffer
}

const SELECTION_EXPORT_FIELDS = [
  'Selection Result',
  'Selection Result Updated',
  'Personal Desirability Rank',
  'Desirability Notes',
  'My Competitiveness Category',
  'Competitiveness Notes',
  'Classification Last Updated',
] as const

function cloneWorkbook(workbook: XLSX.WorkBook): XLSX.WorkBook {
  const buffer = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
    cellStyles: true,
  }) as ArrayBuffer
  return XLSX.read(buffer, {
    type: 'array',
    cellDates: true,
    cellFormula: true,
    cellStyles: true,
  })
}

function applySchoolSelectionExport(
  workbook: XLSX.WorkBook,
  programs: ProgramView[],
  selection: SchoolSelectionState,
): void {
  const worksheet = workbook.Sheets.Programs
  if (!worksheet?.['!ref']) return

  const range = XLSX.utils.decode_range(worksheet['!ref'])
  const columns = new Map<string, number>()
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const header = worksheet[XLSX.utils.encode_cell({ r: range.s.r, c: column })]?.v
    if (header != null) columns.set(String(header).trim(), column)
  }

  SELECTION_EXPORT_FIELDS.forEach((field) => {
    const sourceField = FIELD_ALIASES.Programs?.[field]
    if (!columns.has(field) && sourceField && columns.has(sourceField)) columns.set(field, columns.get(sourceField)!)
    if (columns.has(field)) return
    range.e.c += 1
    const address = XLSX.utils.encode_cell({ r: range.s.r, c: range.e.c })
    const previous = worksheet[XLSX.utils.encode_cell({ r: range.s.r, c: range.e.c - 1 })]
    worksheet[address] = {
      t: 's',
      v: field,
      s: previous?.s,
    }
    columns.set(field, range.e.c)
  })
  worksheet['!ref'] = XLSX.utils.encode_range(range)

  const rankById = new Map(selection.rankingOrder.map((programId, index) => [programId, index + 1]))
  programs.forEach((program) => {
    const classificationUpdated = selection.classificationUpdated[program.id]
    const values: Record<(typeof SELECTION_EXPORT_FIELDS)[number], CellValue> = {
      'Selection Result': selection.results?.[program.id] ?? '未分類',
      'Selection Result Updated': selection.resultUpdated?.[program.id] ? new Date(selection.resultUpdated[program.id]!) : null,
      'Personal Desirability Rank': rankById.get(program.id) ?? null,
      'Desirability Notes': selection.rankingNotes[program.id] ?? '',
      'My Competitiveness Category': selection.competitivenessCategories[program.id] ?? '資料不足',
      'Competitiveness Notes': selection.competitivenessNotes[program.id] ?? '',
      'Classification Last Updated': classificationUpdated
        ? new Date(classificationUpdated)
        : null,
    }
    SELECTION_EXPORT_FIELDS.forEach((field) => {
      const column = columns.get(field)
      if (column == null) return
      const address = XLSX.utils.encode_cell({ r: program.row.__row, c: column })
      const value = values[field]
      if (value === null || value === '') {
        delete worksheet[address]
        return
      }
      worksheet[address] = value instanceof Date
        ? { t: 'd', v: value, z: 'yyyy-mm-dd' }
        : typeof value === 'number'
          ? { t: 'n', v: value }
          : { t: 's', v: String(value) }
    })
  })

  const widths = worksheet['!cols'] ?? []
  while (widths.length <= range.e.c) widths.push({ wch: 18 })
  SELECTION_EXPORT_FIELDS.forEach((field) => {
    const column = columns.get(field)
    if (column != null) widths[column] = { wch: Math.max(field.length + 2, field.includes('Notes') ? 28 : 22) }
  })
  worksheet['!cols'] = widths

  // The current program summary is an export view; keep its classifications and ranks current.
  // Historical ranking sheets are deliberately left intact.
  const summaryEdits: CellEdit[] = []
  for (const row of sheetRows(workbook, 'Summary and Ranking')) {
    if (!getValue(row, 'University') || !getValue(row, 'Program')) continue
    const id = makeProgramKey(getValue(row, 'University'), getValue(row, 'Program'))
    for (const [field, value] of [
      ['Selection Result', selection.results?.[id] ?? '未分類'],
      ['Personal Desirability Rank', rankById.get(id) ?? null],
    ] as [string, CellValue][]) {
      const edit = makeEdit(workbook, row, field, value)
      if (edit) summaryEdits.push(edit)
    }
  }
  applyEdits(workbook, summaryEdits)
}

export function createExportWorkbook(
  workbook: XLSX.WorkBook,
  programs?: ProgramView[],
  selection?: SchoolSelectionState,
): ArrayBuffer {
  const exported = cloneWorkbook(workbook)
  if (programs && selection) applySchoolSelectionExport(exported, programs, selection)
  return XLSX.write(exported, { bookType: 'xlsx', type: 'array', cellStyles: true, compression: true }) as ArrayBuffer
}

export function downloadWorkbook(
  workbook: XLSX.WorkBook,
  fileName: string,
  programs?: ProgramView[],
  selection?: SchoolSelectionState,
): void {
  const data = createExportWorkbook(workbook, programs, selection)
  downloadBlob(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName)
}

export function createProgramsCsv(workbook: XLSX.WorkBook, programs: ProgramView[], selection: SchoolSelectionState, scope: 'all' | 'provided' = 'all'): string {
  const exported = cloneWorkbook(workbook)
  applySchoolSelectionExport(exported, programs, selection)
  const allRows = XLSX.utils.sheet_to_json<Record<string, CellValue>>(exported.Sheets.Programs!, { defval: null })
  const byId = new Map(allRows.map(row => [makeProgramKey(row.University, row['Program Name']), row]))
  const rows = scope === 'provided' ? programs.flatMap(program => { const row = byId.get(program.id); return row ? [row] : [] }) : allRows
  const first = [...(scope === 'provided' ? ['Selection Result'] : []), 'Program Name', 'Degree', 'University', 'Campus', 'Delivery Mode', 'Program ID']
  const headers = XLSX.utils.sheet_to_json<string[]>(exported.Sheets.Programs!, { header: 1 })[0] ?? []
  const fields = [...first, ...headers.filter(field => field && !first.includes(field))]
  const sheet = XLSX.utils.aoa_to_sheet([fields, ...rows.map((row) => fields.map((field) => row[field] ?? null))], { cellDates: true })
  return '\uFEFF' + XLSX.utils.sheet_to_csv(sheet)
}

export function downloadProgramsCsv(workbook: XLSX.WorkBook, programs: ProgramView[], selection: SchoolSelectionState): void {
  downloadBlob(new Blob([createProgramsCsv(workbook, programs, selection)], { type: 'text/csv;charset=utf-8' }), 'Easier_programs.csv')
}

export function downloadJsonBackup(state: PersistedTracker): void {
  const json = JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2)
  const name = `fall-2027-application-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`
  downloadBlob(new Blob([json], { type: 'application/json' }), name)
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}
