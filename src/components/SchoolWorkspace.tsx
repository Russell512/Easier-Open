import { useState } from 'react'
import { ArrowRight, ExternalLink, ListChecks } from 'lucide-react'
import type { CellValue, DataRow, ProgramView, SchoolSelectionState, WorkbookModel } from '../types'
import { checklistProgress, displayValue, formatDate, getValue, isChecklistDone, makeProgramKey, PROGRAM_STATUS_ORDER, toDateInput } from '../lib/workbook'
import './school-workspace.css'
import { statusLabel } from '../lib/status'
type EditHandler = (row: DataRow, field: string, value: CellValue) => void
const text = (row: DataRow | undefined, field: string) => {
  const raw = getValue(row, field)
  if (raw instanceof Date && field === 'Deadline Local Time') return new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }).format(raw)
  if (raw instanceof Date && field === 'Taipei Deadline｜僅已知時刻') return new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(raw)
  const value = displayValue(raw)
  return value === 'Unknown' ? '待確認' : value
}
const date = (value: CellValue) => value ? formatDate(value) : '尚未確認'

export function StatusSelect({ program, onEdit }: { program: ProgramView; onEdit: EditHandler }) {
  return <select className={`school-status status-${program.status.toLowerCase()}`} aria-label={`${program.university} ${program.programName} 申請階段`} value={program.status} onChange={(e) => onEdit(program.row, 'Application Status', e.target.value)}>
    {[...new Set([...PROGRAM_STATUS_ORDER, program.status])].map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
  </select>
}

export function Progress({ program }: { program: ProgramView }) {
  const { done, total, percent } = checklistProgress(program.checklistRow)
  return <div className="school-progress"><div><span>{done} / {total} 項</span><span>{percent}%</span></div><progress max="100" value={percent} aria-label={`${program.university} 材料完成 ${percent}%`} /></div>
}

const comparisonGroups = [
  { title: '申請流程', fields: [['選校結果', '$result'], ['目前階段', '$status'], ['材料完成度', '$progress'], ['目前卡關', '$blocker'], ['下一步', 'Next Action']] },
  { title: '日期與查證', fields: [['官方截止日', 'Application Deadline'], ['查證狀態', 'Evidence Category'], ['當地截止時刻', 'Deadline Local Time'], ['截止時區', 'Deadline IANA Zone'], ['台北截止時間（來源換算）', 'Taipei Deadline｜僅已知時刻'], ['內部規劃日（非官方）', 'Internal Planning Deadline｜非官方承諾'], ['提前 / 費用優惠', 'Priority / CMU Fee-Early｜見說明'], ['特殊期限說明', 'Notes']] },
  { title: '學程與研究', fields: [['學位', 'Degree'], ['校區／學院', 'Campus'], ['上課方式', 'Delivery Mode'], ['學程代碼', 'Program Code'], ['學分', 'Credits'], ['分支方向', 'Concentrations'], ['課程型態', 'Program Type'], ['修業時間', 'Duration'], ['論文路線', 'Thesis Available'], ['研究機會', 'Master’s Research Accessibility'], ['研究方向', 'Relevant Research Areas'], ['契合度（個人評分）', 'Research Fit Score'], ['你的竞争分類', '$category']] },
  { title: '申請要求', fields: [['GRE', 'GRE Requirement'], ['TOEFL 新制 1–6', 'TOEFL 1–6｜2026新制'], ['TOEFL 舊制 0–120', 'TOEFL 0–120｜舊制'], ['IELTS', 'IELTS Requirement'], ['英語豁免 / TA 說明', 'English Notes / TA'], ['推薦信數量', 'Recommendation Letters'], ['必備材料', 'Required Materials'], ['教授聯絡要求', 'Faculty Contact Required／Recommended']] },
  { title: '費用與資助', fields: [['申請費（USD）', 'Application Fee'], ['學費 / 計價期間', 'Tuition'], ['必要費用', 'Mandatory Fees'], ['生活費', 'Estimated Living Cost'], ['費用年度 / 缺口', 'Cost Evidence Year / Gap'], ['資助機會', 'RA／TA／Fellowship']] },
  { title: '資料來源', fields: [['學程身分查核', 'Program Identity Verified'], ['學程差異／備註', 'Program Identity Notes'], ['最後招生查證日期', 'Last Verified Date'], ['官方申請頁', 'Official Application URL'], ['材料要求來源', 'Requirements Source URL'], ['英語要求來源', 'English Official Source'], ['費用來源', 'Funding/Cost Source URL']] },
]
function comparisonValue(p: ProgramView, field: string, selection: SchoolSelectionState) {
  if (field === '$result') return selection.results?.[p.id] ?? '未分類'
  if (field === '$status') return statusLabel(p.status)
  if (field === '$progress') { const progress = checklistProgress(p.checklistRow); return `${progress.done} / ${progress.total} 項（${progress.percent}%）` }
  if (field === '$blocker') return text(p.checklistRow, 'Current Blocker')
  if (field === '$category') return selection.competitivenessCategories[p.id] ?? '資料不足'
  return text(p.row, field)
}
export function Comparison({ programs, selection, differencesOnly, onOpen }: { programs: ProgramView[]; selection: SchoolSelectionState; differencesOnly: boolean; onOpen: (id: string) => void }) {
  return <div className="comparison-scroll"><table className="comparison-table" style={{ minWidth: 180 + programs.length * 270 }}><thead><tr><th>比較項目</th>{programs.map((p) => <th key={p.id}><button onClick={() => onOpen(p.id)}><strong>{p.programName}</strong><span>{p.university}</span><small>開啟學程頁面 ↗</small></button></th>)}</tr></thead>{comparisonGroups.map((group) => {
    const rows = group.fields.map(([label, field]) => ({ label: label!, field: field!, values: programs.map((p) => comparisonValue(p, field!, selection)) })).filter((row) => !differencesOnly || new Set(row.values).size > 1)
    return rows.length ? <tbody key={group.title}><tr className="comparison-section"><th colSpan={programs.length + 1}>{group.title}</th></tr>{rows.map(({ label, field, values }) => <tr key={field} className={new Set(values).size > 1 ? 'different' : ''}><th>{label}{new Set(values).size > 1 && <span className="difference-dot" title="各校條件不同" />}</th>{values.map((value, i) => <td key={programs[i]!.id}>{/^https?:\/\/\S+$/.test(value) ? <a href={value} target="_blank" rel="noreferrer">官方來源 <ExternalLink size={12} /></a> : value}</td>)}</tr>)}</tbody> : null
  })}</table></div>
}

export function TimelineTask({ row, onEdit, onOpen }: { row: DataRow; onEdit: EditHandler; onOpen?: () => void }) {
  const done = isChecklistDone(getValue(row, 'Status'))
  const status = String(getValue(row, 'Status') ?? 'Not started')
  return <div className={`timeline-task ${done ? 'done' : ''}`}>
    <select aria-label={`${text(row, 'University')} ${text(row, 'Task')} 任務狀態`} value={status} onChange={(e) => onEdit(row, 'Status', e.target.value)}>{[...new Set(['Not started', 'In progress', 'Waiting on others', 'Completed', 'Verified', 'Not needed', status])].map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</select>
    <div className="task-content"><strong>{text(row, 'Task')}</strong>{onOpen && <button onClick={onOpen}>{text(row, 'University')} · {text(row, 'Program')} ↗</button>}<details><summary>依賴與說明</summary><p>{text(row, 'Dependency')} · {text(row, 'Notes')}</p>{/^https?:\/\//.test(text(row, 'Source')) && <a href={text(row, 'Source')} target="_blank" rel="noreferrer">官方來源 ↗</a>}</details></div>
    <div className="task-dates"><span>內部目標</span><input type="date" aria-label={`${text(row, 'University')} ${text(row, 'Program')} ${text(row, 'Task')} 內部目標`} value={toDateInput(getValue(row, 'My Target Deadline'))} onChange={(e) => onEdit(row, 'My Target Deadline', e.target.value ? new Date(`${e.target.value}T00:00:00`) : null)} /><small>官方：{getValue(row, 'Official Deadline') ? formatDate(getValue(row, 'Official Deadline')) : '未列日期'}</small></div>
  </div>
}

export function SchoolFlow({ program, model, onEdit }: { program: ProgramView; model: WorkbookModel; onEdit: EditHandler }) {
  const tasks = model.programTimeline.filter((r) => makeProgramKey(getValue(r, 'University'), getValue(r, 'Program')) === program.id)
  const [showCompleted, setShowCompleted] = useState(false)
  const visible = tasks.filter((r) => showCompleted || !isChecklistDone(getValue(r, 'Status')))
  return <div className="school-flow">
    <div className="flow-summary"><label>目前申請階段<StatusSelect program={program} onEdit={onEdit} /></label><div><span>材料準備</span><Progress program={program} /></div></div>
    <div className="flow-action"><h3><ArrowRight size={16} />下一步</h3><textarea aria-label="編輯下一步" value={program.nextAction === 'Unknown' ? '' : program.nextAction} placeholder="寫下要先完成的一件事…" onChange={(e) => onEdit(program.row, 'Next Action', e.target.value)} />{program.checklistRow && <label>目前卡關<textarea aria-label="編輯目前卡關" value={String(getValue(program.checklistRow, 'Current Blocker') ?? '')} placeholder="等待推薦信、待確認要求…" onChange={(e) => onEdit(program.checklistRow!, 'Current Blocker', e.target.value)} /></label>}</div>
    <div className="flow-deadlines"><div><span>官方截止日</span><strong>{date(program.deadline)}</strong><small>{text(program.row, 'Evidence Category')}</small></div><div><span>內部規劃日</span><strong>{getValue(program.row, 'Internal Planning Deadline｜非官方承諾') ? formatDate(getValue(program.row, 'Internal Planning Deadline｜非官方承諾')) : '未設定'}</strong><small>個人安排，非校方承諾</small></div></div>
    <div className="timeline-heading"><h3><ListChecks size={17} />申請任務 · {visible.length}</h3><label><input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />顯示已完成</label></div>
    <p className="flow-caption">任務與材料分別記錄：完成時程任務後，請在「申請材料」確認對應材料的狀態。</p>
    <div className="timeline-list">{visible.map((r) => <TimelineTask key={r.__id} row={r} onEdit={onEdit} />)}{!visible.length && <p className="workspace-empty">目前沒有未完成的任務。</p>}</div>
  </div>
}
