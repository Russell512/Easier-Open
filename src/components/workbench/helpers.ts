import type { CellValue, DataRow } from '../../types'
import { displayValue, formatDate, getValue } from '../../lib/workbook'

export type EditHandler = (row: DataRow, field: string, value: CellValue) => void
export const fieldText = (row: DataRow | undefined, field: string) => {
  const value = displayValue(getValue(row, field))
  return value === 'Unknown' ? '待確認' : value
}
export const dateText = (value: CellValue) => value ? formatDate(value) : '尚未確認'
export const dateNumber = (value: CellValue) => {
  const number = value instanceof Date ? value.getTime() : value ? Date.parse(String(value)) : NaN
  return Number.isFinite(number) ? number : Infinity
}
export function schoolInitials(name: string) {
  const known: Record<string, string> = { 'Stanford University': 'SU', 'Carnegie Mellon University': 'CMU', 'University of California, Berkeley': 'UCB', 'University of California, Los Angeles': 'UCLA', 'Georgia Institute of Technology': 'GT', 'Massachusetts Institute of Technology': 'MIT' }
  return known[name] ?? name.replace(/University of |University|The |Institute of |Technology|, /g, '').trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase()
}
