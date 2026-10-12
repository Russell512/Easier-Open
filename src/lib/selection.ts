import * as XLSX from 'xlsx'
import type {
  CompetitivenessCategory,
  CellEdit,
  ProgramView,
  RankingInitialization,
  SchoolSelectionState,
  SelectionResult,
  WorkbookModel,
} from '../types'
import { buildProgramViews, displayValue, getValue, makeEdit, makeProgramKey } from './workbook'

export const SELECTION_RESULTS: SelectionResult[] = ['未分類', '彩票', '衝刺', '主申', '較為保險', '淘汰']
export function selectionResult(value: unknown): SelectionResult {
  return SELECTION_RESULTS.includes(value as SelectionResult) ? value as SelectionResult : '未分類'
}
export function assignSelectionResult(selection: SchoolSelectionState, id: string, result: SelectionResult): SchoolSelectionState {
  if ((selection.results?.[id] ?? '未分類') === result) return selection
  return { ...selection, results: { ...selection.results, [id]: result }, resultUpdated: { ...selection.resultUpdated, [id]: new Date().toISOString() } }
}

export function hasSelectionDecision(selection: SchoolSelectionState, id: string): boolean {
  return selectionResult(selection.results?.[id]) !== '未分類'
}

export function selectionStatusEdits(model: WorkbookModel, selection: SchoolSelectionState): CellEdit[] {
  return buildProgramViews(model).flatMap((program) => {
    if (!['Researching', 'Exploring', 'Unknown', '', 'Shortlisted'].includes(program.status)) return []
    const status = hasSelectionDecision(selection, program.id) ? 'Shortlisted' : 'Researching'
    if (program.status === status) return []
    const edit = makeEdit(model.workbook, program.row, 'Application Status', status)
    return edit ? [edit] : []
  })
}

export const COMPETITIVENESS_CATEGORIES: CompetitivenessCategory[] = [
  '相對穩健',
  '合理競爭',
  '高度競爭',
  '資料不足',
]

function numericRank(value: unknown) {
  const rank = Number(value)
  return Number.isFinite(rank) && rank > 0 ? rank : null
}

export function mapCompetitiveness(value: unknown): CompetitivenessCategory {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized || normalized === 'unknown' || normalized.includes('insufficient data')) return '資料不足'
  if (normalized.includes('highly competitive') || normalized === 'reach' || normalized.includes('reach')) return '高度競爭'
  if (
    normalized.includes('relatively attainable') ||
    normalized === 'safer' ||
    normalized.includes('safer')
  ) return '相對穩健'
  if (
    normalized === 'competitive' ||
    normalized === 'reasonable' ||
    normalized === 'target' ||
    normalized === 'maybe' ||
    normalized.includes('competitive') ||
    normalized.includes('reasonable')
  ) return '合理競爭'
  return '資料不足'
}

function summaryRows(model: WorkbookModel) {
  const worksheet = model.workbook.Sheets['Summary and Ranking']
  if (!worksheet?.['!ref']) return [] as Array<Record<string, unknown>>
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    header: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'],
    range: 0,
    defval: null,
    raw: true,
  })
}

function extractSummaryDesirability(model: WorkbookModel, validIds: Set<string>) {
  const ranked: Array<{ id: string; rank: number }> = []
  let insideSection = false
  for (const row of summaryRows(model)) {
    const label = String(row.A ?? '').trim()
    if (label.startsWith('A. Desirability Ranking')) {
      insideSection = true
      continue
    }
    if (insideSection && label.startsWith('B. ')) break
    if (!insideSection) continue
    const rank = numericRank(row.A)
    const id = makeProgramKey(row.B as string | null, row.C as string | null)
    if (rank && validIds.has(id)) ranked.push({ id, rank })
  }
  return ranked.sort((a, b) => a.rank - b.rank).map((item) => item.id)
}

export function summaryCompetitivenessDrivers(model: WorkbookModel) {
  const drivers: Record<string, string> = {}
  let insideSection = false
  for (const row of summaryRows(model)) {
    const label = String(row.A ?? '').trim()
    if (label.startsWith('B. Baseline Competitiveness Ranking')) {
      insideSection = true
      continue
    }
    if (insideSection && label.startsWith('C. ')) break
    if (!insideSection || !numericRank(row.A)) continue
    const id = makeProgramKey(row.B as string | null, row.C as string | null)
    const driver = String(row.F ?? '').trim()
    if (driver) drivers[id] = driver
  }
  return drivers
}

function rankOrderFromField(programs: ProgramView[], field: string) {
  const ranked = programs
    .map((program) => ({ id: program.id, rank: numericRank(getValue(program.row, field)) }))
    .filter((item): item is { id: string; rank: number } => item.rank !== null)
    .sort((a, b) => a.rank - b.rank)
  return ranked.length === programs.length ? ranked.map((item) => item.id) : []
}

function initialRanking(model: WorkbookModel, programs: ProgramView[]): {
  order: string[]
  source: RankingInitialization
} {
  const personal = rankOrderFromField(programs, 'Personal Desirability Rank')
  if (personal.length) return { order: personal, source: 'personal-rank' }

  const desirability = rankOrderFromField(programs, 'Desirability Rank')
  if (desirability.length) return { order: desirability, source: 'desirability-rank' }

  const summary = extractSummaryDesirability(model, new Set(programs.map((program) => program.id)))
  if (summary.length === programs.length) return { order: summary, source: 'summary-ranking' }

  return {
    order: [...programs]
      .sort((a, b) => Number(b.researchFitScore ?? 0) - Number(a.researchFitScore ?? 0))
      .map((program) => program.id),
    source: 'research-fit',
  }
}

export function createInitialSchoolSelection(model: WorkbookModel): SchoolSelectionState {
  const programs = buildProgramViews(model)
  const ranking = initialRanking(model, programs)
  const rankingNotes: Record<string, string> = {}
  const competitivenessCategories: Record<string, CompetitivenessCategory> = {}
  const competitivenessNotes: Record<string, string> = {}
  const classificationUpdated: Record<string, string> = {}
  const results: Record<string, SelectionResult> = {}
  const resultUpdated: Record<string, string> = {}

  programs.forEach((program) => {
    results[program.id] = selectionResult(getValue(program.row, 'Selection Result'))
    const resultDate = getValue(program.row, 'Selection Result Updated')
    if (resultDate) resultUpdated[program.id] = resultDate instanceof Date ? resultDate.toISOString() : String(resultDate)
    const desirabilityNotes = displayValue(getValue(program.row, 'Desirability Notes'))
    if (desirabilityNotes !== 'Unknown') rankingNotes[program.id] = desirabilityNotes

    const existingCategory = String(getValue(program.row, 'My Competitiveness Category') ?? '').trim()
    competitivenessCategories[program.id] = COMPETITIVENESS_CATEGORIES.includes(
      existingCategory as CompetitivenessCategory,
    )
      ? existingCategory as CompetitivenessCategory
      : mapCompetitiveness(getValue(program.row, 'Baseline Competitiveness') ?? getValue(program.row, 'Enhanced Competitiveness'))

    const notes = displayValue(getValue(program.row, 'Competitiveness Notes'))
    if (notes !== 'Unknown') competitivenessNotes[program.id] = notes

    const updated = getValue(program.row, 'Classification Last Updated')
    if (updated) {
      classificationUpdated[program.id] = updated instanceof Date
        ? updated.toISOString()
        : String(updated)
    }
  })

  return {
    results,
    resultUpdated,
    rankingOrder: ranking.order,
    rankingNotes,
    rankingInitialization: ranking.source,
    competitivenessCategories,
    competitivenessNotes,
    classificationUpdated,
  }
}

export function reconcileSchoolSelection(
  model: WorkbookModel,
  saved?: SchoolSelectionState,
): SchoolSelectionState {
  const initial = createInitialSchoolSelection(model)
  if (!saved) return initial
  const validIds = new Set(initial.rankingOrder)
  const savedOrder = saved.rankingOrder.filter((id) => validIds.has(id))
  const missing = initial.rankingOrder.filter((id) => !savedOrder.includes(id))
  return {
    results: Object.fromEntries([...validIds].map((id) => [id, selectionResult(saved.results?.[id] ?? initial.results?.[id])])),
    resultUpdated: { ...initial.resultUpdated, ...saved.resultUpdated },
    rankingOrder: [...savedOrder, ...missing],
    rankingNotes: { ...initial.rankingNotes, ...saved.rankingNotes },
    rankingInitialization: saved.rankingInitialization ?? initial.rankingInitialization,
    competitivenessCategories: {
      ...initial.competitivenessCategories,
      ...saved.competitivenessCategories,
    },
    competitivenessNotes: {
      ...initial.competitivenessNotes,
      ...saved.competitivenessNotes,
    },
    classificationUpdated: {
      ...initial.classificationUpdated,
      ...saved.classificationUpdated,
    },
  }
}

export function hasCompetitivenessConflict(program: ProgramView) {
  const baseline = mapCompetitiveness(getValue(program.row, 'Baseline Competitiveness'))
  const enhanced = mapCompetitiveness(getValue(program.row, 'Enhanced Competitiveness'))
  return baseline !== '資料不足' && enhanced !== '資料不足' && baseline !== enhanced
}

export function fundingSummary(program: ProgramView) {
  const funding = displayValue(getValue(program.row, 'RA／TA／Fellowship'))
  const tuition = displayValue(getValue(program.row, 'Tuition'))
  return [funding !== 'Unknown' ? funding : null, tuition !== 'Unknown' ? tuition : null]
    .filter(Boolean)
    .join(' · ') || 'Unknown'
}
