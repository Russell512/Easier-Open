import type * as XLSX from 'xlsx'

export type CellValue = string | number | boolean | Date | null

export interface DataRow {
  __sheet: string
  __row: number
  __id: string
  values: Record<string, CellValue>
}

export interface SerializedValue {
  kind: 'string' | 'number' | 'boolean' | 'date' | 'null'
  value: string | number | boolean | null
}

export interface CellEdit {
  sheet: string
  address: string
  value: SerializedValue
  updatedAt: string
}

export interface PersistedTracker {
  version: 1
  fileName: string
  sourceBase64: string
  edits: CellEdit[]
  savedAt: string
  schoolSelection?: SchoolSelectionState
}

export interface WorkbookModel {
  workbook: XLSX.WorkBook
  programs: DataRow[]
  faculty: DataRow[]
  checklist: DataRow[]
  programTimeline: DataRow[]
  masterTimeline: DataRow[]
  sheetSummaries: SheetSummary[]
  warnings: string[]
}

export interface SheetSummary {
  name: string
  rows: number
  columns: number
  headers: string[]
}

export type AppTab = 'dashboard' | 'programs' | 'compare' | 'documents' | 'selection' | 'results' | 'faculty' | 'checklist' | 'sop-materials' | 'notes' | 'data'

export type SelectionResult = '未分類' | '彩票' | '衝刺' | '主申' | '較為保險' | '淘汰'

export type CompetitivenessCategory = '相對穩健' | '合理競爭' | '高度競爭' | '資料不足'

export type RankingInitialization = 'personal-rank' | 'desirability-rank' | 'summary-ranking' | 'research-fit' | 'user'

export interface SchoolSelectionState {
  results?: Record<string, SelectionResult>
  resultUpdated?: Record<string, string>
  rankingOrder: string[]
  rankingNotes: Record<string, string>
  rankingInitialization: RankingInitialization
  competitivenessCategories: Record<string, CompetitivenessCategory>
  competitivenessNotes: Record<string, string>
  classificationUpdated: Record<string, string>
}

export interface ProgramView {
  id: string
  row: DataRow
  university: string
  programName: string
  degree: string
  status: string
  deadline: CellValue
  targetDeadline: CellValue
  researchFitScore: CellValue
  competitiveness: string
  nextAction: string
  researchAreas: string
  completion: number
  checklistRow?: DataRow
}
