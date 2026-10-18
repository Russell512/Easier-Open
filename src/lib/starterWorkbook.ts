import * as XLSX from 'xlsx'
import type { WorkbookModel } from '../types'
import { CHECKLIST_FIELDS } from './workbook'
import { PROGRAM_IMPORT_FIELDS } from './programImport'

export const STARTER_TEMPLATE_ID = 'easier-empty-v1'

const programHeaders = [...new Set([
  ...PROGRAM_IMPORT_FIELDS.map(field => field.key),
  'Program ID', 'Application Status', 'Application Complete', 'Research Fit Score', 'Next Action',
  'Selection Result', 'Selection Result Updated', 'Personal Desirability Rank', 'Desirability Notes',
  'My Competitiveness Category', 'Competitiveness Notes', 'Classification Last Updated',
  'Delivery Mode', 'Program Type', 'Duration', 'Department', 'Official Degree Name',
  'GRE Requirement', 'TOEFL Requirement', 'IELTS Requirement', 'Recommendation Letters',
  'Deadline Status', 'Evidence Category', 'Verification Scope / Limit', 'Last Verified Date',
  'Program Identity Verified', 'Requirements Verified', 'Missing Information',
  'Data Origin', 'Added Date', 'Imported Program Name',
])]

/** A schema-only workbook for a new account; never derived from another user's data. */
export function createStarterWorkbook(): ArrayBuffer {
  const workbook = XLSX.utils.book_new()
  const sheets: Record<string, string[]> = {
    Programs: programHeaders,
    'Application Checklist': ['University', 'Program', ...CHECKLIST_FIELDS, 'Current Blocker', 'Next Action', 'Target Date'],
    Faculty: ['University', 'Program', 'Faculty Name', 'Title', 'Research Areas', 'Source URLs', 'Last Verified Date'],
    'Per-Program Timeline': ['University', 'Program', 'Task', 'Official Deadline', 'My Target Deadline', 'Status', 'Dependency', 'Source', 'Notes'],
    'Master Timeline': ['Phase', 'Task', 'Start Date', 'Target Completion Date', 'Status'],
  }
  for (const [name, headers] of Object.entries(sheets)) {
    const sheet = XLSX.utils.aoa_to_sheet([headers])
    sheet['!cols'] = headers.map(() => ({ wch: 26 }))
    XLSX.utils.book_append_sheet(workbook, sheet, name)
  }
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Template'], [STARTER_TEMPLATE_ID], ['Personal workspace. Add your own programs to get started.'],
  ]), 'Easier Template')
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer
}

/** Recognize an intentional empty workspace without accepting a broken or arbitrary empty file. */
export function isStarterWorkbook(model: WorkbookModel): boolean {
  if (model.workbook.Sheets['Easier Template']?.A2?.v !== STARTER_TEMPLATE_ID) return false
  const required: Record<string, string[]> = {
    Programs: ['University', 'Program Name', 'Degree', 'Application Deadline', 'Application Status', 'Next Action'],
    'Application Checklist': ['University', 'Program', ...CHECKLIST_FIELDS, 'Target Date'],
    Faculty: ['University', 'Program', 'Faculty Name'],
    'Per-Program Timeline': ['University', 'Program', 'Task'],
    'Master Timeline': ['Task'],
  }
  return Object.entries(required).every(([name, fields]) => {
    const headers = model.sheetSummaries.find(sheet => sheet.name === name)?.headers ?? []
    return fields.every(field => headers.includes(field))
  }) && model.checklist.length === model.programs.length
    && model.programs.every(row => Boolean(row.values.University && row.values['Program Name']))
}

/** Storage can wrap an object-missing 404 inside an HTTP 400 response. */
export function isMissingSeedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const value = error as { status?: unknown; statusCode?: unknown; code?: unknown; message?: unknown }
  if (value.status !== 404 && String(value.statusCode) !== '404') return false
  if (value.code && !['NoSuchKey', 'NoSuchObject', 'not_found'].includes(String(value.code))) return false
  if (/bucket|access.?denied|permission|unauthori[sz]ed/i.test(String(value.message ?? ''))) return false
  return true
}
