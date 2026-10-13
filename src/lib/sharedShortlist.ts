import type { ProgramView, SchoolSelectionState, SelectionResult } from '../types'
import { shortlistPrograms } from './shortlistExport'
import { selectionResult } from './selection'
import { formatDate, getValue } from './workbook'
import { requirementEvidence, type RequirementEvidence } from './requirements'
import { safeWebUrl } from './documents'

export interface SharedProgram {
  id: string
  university: string
  programName: string
  degree: string
  category: SelectionResult
  campus: string
  delivery: string
  deadline: string
  deadlineStatus: string
  deadlineSource: string
  website: string
  applicationUrl: string
  areas: string
  verified: string
  requirements: Record<string, RequirementEvidence>
}
export interface SharedShortlist {
  version: 1
  cycle: string
  programs: SharedProgram[]
}
export interface ShareSettings {
  token: string
  enabled: boolean
  require_login: boolean
  published_at: string
}
// Explicit projection: never spread workbook rows, user notes, scores, or file metadata.
export function createSharedShortlist(programs: ProgramView[], selection: SchoolSelectionState): SharedShortlist {
  return {
    version: 1, cycle: 'Fall 2027',
    programs: shortlistPrograms(programs, selection).map(program => {
      const text = (field: string) => String(getValue(program.row, field) ?? '')
      const url = (field: string) => safeWebUrl(text(field)) ?? ''
      return {
        id: program.id, university: program.university, programName: program.programName,
        degree: program.degree, category: selectionResult(selection.results?.[program.id]),
        campus: text('Campus'), delivery: text('Delivery Mode'), deadline: program.deadline ? formatDate(program.deadline) : '',
        deadlineStatus: text('Evidence Category'), deadlineSource: url('Admissions/Deadline Source URL'),
        website: url('Official Program URL'), applicationUrl: url('Official Application URL'),
        areas: text('Relevant Research Areas'), verified: text('Requirements Verified'),
        requirements: requirementEvidence(program.row),
      }
    }),
  }
}

export function shareTokenFromUrl(search = window.location.search): string | null {
  const token = new URLSearchParams(search).get('share')
  return token && /^[a-f0-9]{48}$/.test(token) ? token : null
}
export function shareUrl(token: string): string {
  const url = new URL(window.location.pathname, window.location.origin)
  url.searchParams.set('share', token)
  return url.href
}
