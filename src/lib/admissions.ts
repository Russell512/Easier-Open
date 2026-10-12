import type { DataRow } from '../types'
import { getValue, formatDate } from './workbook'

export const DEADLINE_EVIDENCE: Record<string, string> = {
  confirmed: '2027 已公布', annual: '官網固定月日／年度待複核', tentative: '2027 暫定',
  unpublished: '2027 尚未公布', stale: '官網仍為舊年度', conflict: '官網資訊矛盾',
  closed: '2027 停止招生', availability: '招生途徑待確認', rolling: '全年滾動申請',
}
export interface AdmissionDeadlineEvent {
  date: string
  type: string
  evidence: string
  source: string
  notes: string
  time: string
  zone: string
  taipei: string
}

/** Imported workbooks may contain arbitrary JSON. Render only well-formed, sourced events. */
export function getDeadlineEvents(row: DataRow): AdmissionDeadlineEvent[] {
  const raw = getValue(row, 'Deadline Events JSON')
  if (typeof raw !== 'string') return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.slice(0, 100).flatMap((event: unknown) => {
      if (!event || typeof event !== 'object') return []
      const e = event as Record<string, unknown>
      if (typeof e.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return []
      const date = new Date(`${e.date}T00:00:00Z`)
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== e.date) return []
      if (typeof e.source !== 'string') return []
      try { if (!['https:', 'http:'].includes(new URL(e.source).protocol)) return [] } catch { return [] }
      if (typeof e.evidence !== 'string' || !(e.evidence in DEADLINE_EVIDENCE)) return []
      const string = (field: string) => typeof e[field] === 'string' ? e[field] as string : ''
      return [{ date: e.date, source: e.source, evidence: e.evidence, type: string('type') || '申請截止', notes: string('notes'), time: string('time'), zone: string('zone'), taipei: string('taipei') }]
    })
  } catch { return [] }
}

export function deadlineStatusText(row: DataRow): string {
  const status = String(getValue(row, 'Deadline Status') ?? '')
  return DEADLINE_EVIDENCE[status] ?? String(getValue(row, 'Evidence Category') ?? '待確認')
}

export function deadlineDateLabel(row: DataRow): string {
  const date = getValue(row, 'Application Deadline')
  if (date) return formatDate(date)
  const status = getValue(row, 'Deadline Status')
  return status === 'closed' ? '本輪不招生' : status === 'rolling' ? '全年滾動申請' : '尚未確認'
}
