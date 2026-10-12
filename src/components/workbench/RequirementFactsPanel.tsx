import { BookOpen, ExternalLink, ListChecks } from 'lucide-react'
import type { ProgramView } from '../../types'
import { requirementEvidence, requirementLabels } from '../../lib/requirements'
import { getValue } from '../../lib/workbook'
import { Panel } from './shared'

export function RequirementFactsPanel({ program, compact = false, onExpand }: { program: ProgramView; compact?: boolean; onExpand?: () => void }) {
  const facts = requirementEvidence(program.row)
  const checked = String(getValue(program.row, 'Requirements Verified') ?? '')
  const groups = compact
    ? [{ title: '申請前先確認', fields: ['gre', 'toefl', 'toeflNew', 'tuition', 'funding'] }]
    : [{ title: '官方考試與材料要求', fields: ['gre', 'toefl', 'toeflNew', 'ielts', 'duolingo', 'englishNotes', 'recommendations', 'materials', 'gpa', 'applicationFee', 'feeWaiver'] }, { title: '學費、生活費與資助', fields: ['tuition', 'costYear', 'fees', 'living', 'funding'] }]
  return <div className={compact ? 'wb-stack' : 'wb-requirement-facts-grid'}>{groups.map((group) => <Panel key={group.title} title={group.title} icon={group.fields[0] === 'gre' ? <ListChecks size={17} /> : <BookOpen size={17} />} action={compact && onExpand ? <button className="wb-text-button" onClick={onExpand}>全部要求與費用</button> : undefined}>
    <div className="wb-panel-body"><p className="wb-input-hint">{checked ? `官方資料核對：${checked}` : '以下為目前收錄資料，逐項來源請見查證資訊。'}</p><dl className="wb-requirement-facts">{group.fields.map((key) => {
      const fact = facts[key]
      if (!fact) return null
      return <div key={key} className={key === 'gre' ? 'wb-requirement-gre' : undefined}><dt>{requirementLabels[key]}</dt><dd>{String(fact.value)}{fact.scope === 'school-reference' && <small className="wb-evidence-scope">學院／校級參考價；請留意學程例外</small>}{fact.sources.length > 0 && <span className="wb-fact-sources">{fact.sources.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer">官方來源{fact.sources.length > 1 ? ` ${index + 1}` : ''}<ExternalLink size={11} /></a>)}</span>}</dd></div>
    })}</dl></div>
  </Panel>)}</div>
}
