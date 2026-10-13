import type { ProgramView, SchoolSelectionState, SelectionResult, WorkbookModel } from '../types'
import { selectionResult } from './selection'
import { createProgramsCsv } from './workbook'

export const SHORTLIST_RESULTS: SelectionResult[] = ['彩票', '衝刺', '主申', '較為保險']
export function shortlistPrograms(programs: ProgramView[], selection: SchoolSelectionState): ProgramView[] {
  const ranks = new Map(selection.rankingOrder.map((id, index) => [id, index]))
  return programs.filter(p => SHORTLIST_RESULTS.includes(selectionResult(selection.results?.[p.id]))).sort((a,b) => {
    const category = SHORTLIST_RESULTS.indexOf(selectionResult(selection.results?.[a.id])) - SHORTLIST_RESULTS.indexOf(selectionResult(selection.results?.[b.id]))
    return category || (ranks.get(a.id) ?? Infinity) - (ranks.get(b.id) ?? Infinity) || a.university.localeCompare(b.university) || a.programName.localeCompare(b.programName)
  })
}
export function createShortlistCsv(model: WorkbookModel, programs: ProgramView[], selection: SchoolSelectionState): string {
  return createProgramsCsv(model.workbook, shortlistPrograms(programs, selection), selection, 'provided')
}
export function downloadShortlistCsv(model: WorkbookModel, programs: ProgramView[], selection: SchoolSelectionState): void {
  const blob = new Blob([createShortlistCsv(model, programs, selection)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'Easier_shortlist.csv'
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
