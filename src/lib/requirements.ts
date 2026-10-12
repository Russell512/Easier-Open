import type { DataRow } from '../types'
import { getValue } from './workbook'
import { safeWebUrl } from './documents'

export interface RequirementEvidence { value: string | number; sources: string[]; scope: string }
export const requirementLabels: Record<string, string> = {
  gre: 'GRE 採計規則', toefl: 'TOEFL 舊制 0–120', toeflNew: 'TOEFL 新制 1–6', ielts: 'IELTS Academic', duolingo: 'Duolingo', englishNotes: '英語豁免／有效期限',
  recommendations: '推薦信數量', materials: '必備申請材料', gpa: 'GPA／背景要求', applicationFee: '申請費', feeWaiver: '申請費減免',
  tuition: '學費與計費期間', costYear: '費用適用年度', fees: '必要費用與保險', living: '生活費預算', funding: '獎學金／RA／TA',
}
const fallbackColumns: Record<string, string> = {
  gre: 'GRE Requirement', toefl: 'TOEFL 0–120｜舊制', toeflNew: 'TOEFL 1–6｜2026新制', ielts: 'IELTS Requirement', duolingo: 'Duolingo Requirement', englishNotes: 'English Notes / TA', recommendations: 'Recommendation Letters', materials: 'Required Materials', gpa: 'GPA Requirement', applicationFee: 'Application Fee Details', feeWaiver: 'Fee Waiver', tuition: 'Tuition', costYear: 'Cost Evidence Year / Gap', fees: 'Mandatory Fees', living: 'Estimated Living Cost', funding: 'RA／TA／Fellowship',
}
export function requirementEvidence(row: DataRow): Record<string, RequirementEvidence> {
  const result: Record<string, RequirementEvidence> = {}
  try {
    const parsed: unknown = JSON.parse(String(getValue(row, 'Requirement Evidence JSON') ?? '{}'))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [key, fact] of Object.entries(parsed)) {
        if (!(key in requirementLabels) || !fact || typeof fact !== 'object' || !('value' in fact)) continue
        if (typeof fact.value !== 'string' && typeof fact.value !== 'number') continue
        result[key] = { value: fact.value, sources: Array.isArray(fact.sources) ? fact.sources.filter((url: unknown): url is string => typeof url === 'string' && !!safeWebUrl(url)) : [], scope: typeof fact.scope === 'string' ? fact.scope : 'program' }
      }
    }
  } catch { /* Older workbooks still expose their existing fields below. */ }
  for (const [key, column] of Object.entries(fallbackColumns)) {
    if (result[key]) continue
    const value = getValue(row, column) ?? (key === 'applicationFee' ? getValue(row, 'Application Fee') : null)
    if (typeof value === 'string' || typeof value === 'number') result[key] = { value, sources: [], scope: 'legacy' }
  }
  return result
}
