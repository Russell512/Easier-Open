import { ArrowRight, ArrowUpRight, CalendarDays, CheckCircle2, Clock3, Files, GraduationCap, ListChecks, Plus } from 'lucide-react'
import type { AppTab, ProgramView, SchoolSelectionState, WorkbookModel } from '../../types'
import type { DocumentsController } from '../../hooks/useDocuments'
import { getValue, isChecklistDone, makeProgramKey, formatDate } from '../../lib/workbook'
import { statusLabel } from '../../lib/status'
import { PageHeading, Panel, SchoolIcon } from './shared'
import { dateNumber, dateText, fieldText } from './helpers'

export function OverviewPage({ programs, model, selection, library, onOpen, onNavigate, onAddPrograms }: { programs: ProgramView[]; model: WorkbookModel; selection: SchoolSelectionState; library: DocumentsController; onOpen: (id: string) => void; onNavigate: (tab: AppTab) => void; onAddPrograms: () => void }) {
  const active = programs.filter((program) => !['Rejected', 'Withdrawn'].includes(program.status) && selection.results?.[program.id] !== '淘汰')
  const ranked = [...active].sort((a, b) => { const rank = (id: string) => { const index = selection.rankingOrder.indexOf(id); return index < 0 ? Infinity : index }; return rank(a.id) - rank(b.id) }).slice(0, 4)
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const tasks = model.programTimeline.filter((row) => !isChecklistDone(getValue(row, 'Status')) && active.some((p) => p.id === makeProgramKey(getValue(row, 'University'), getValue(row, 'Program')))).sort((a, b) => dateNumber(getValue(a, 'My Target Deadline')) - dateNumber(getValue(b, 'My Target Deadline')))
  const upcoming = tasks.filter((row) => { const date = dateNumber(getValue(row, 'My Target Deadline')); return date >= now.getTime() && date <= now.getTime() + 14 * 86400000 })
  const overdue = tasks.filter((row) => dateNumber(getValue(row, 'My Target Deadline')) < now.getTime())
  const deadlines = [...active].filter((program) => dateNumber(program.deadline) >= now.getTime() && Number.isFinite(dateNumber(program.deadline))).sort((a, b) => dateNumber(a.deadline) - dateNumber(b.deadline)).slice(0, 4)
  const files = library.documents.filter((doc) => !doc.archived)
  const metrics = [
    { label: '追蹤中的學程', value: active.length, unit: '個', detail: `${programs.length} 個學程已收錄`, icon: GraduationCap, tab: 'programs' as const, tone: 'blue' },
    { label: '材料平均完成度', value: active.length ? Math.round(active.reduce((sum, p) => sum + p.completion, 0) / active.length) : 0, unit: '%', detail: '依各校適用材料計算', icon: ListChecks, tab: 'checklist' as const, tone: 'mint' },
    { label: '未來 14 天的任務', value: upcoming.length, unit: '項', detail: `${overdue.length} 項已超過個人目標日`, icon: CalendarDays, tab: 'programs' as const, tone: 'amber' },
    { label: '我的申請文件', value: files.length, unit: '份', detail: `${files.filter((doc) => doc.stage === '定稿').length} 份定稿 · 含檔案與連結`, icon: Files, tab: 'documents' as const, tone: 'purple' },
  ]
  if (!programs.length) return <section><PageHeading title="工作台" description="你的申請規劃，從這裡開始。" /><div className="wb-panel wb-empty"><GraduationCap size={40} /><h3>建立你的學程清單</h3><p>先新增一個感興趣的學程，或用 CSV 一次匯入清單。接著就能比較選校、整理筆記與追蹤申請進度。</p><button className="wb-button primary" onClick={onAddPrograms}><Plus size={16} />新增學程</button></div><p className="wb-footnote">也可以先從左側「我的文件」或「完整筆記」開始整理。</p></section>
  return <section>
    <PageHeading title="工作台" actions={<><span className="wb-today">{new Intl.DateTimeFormat('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' }).format(now)}</span><button className="wb-button primary" onClick={() => onNavigate('programs')}>瀏覽學程<ArrowRight size={15} /></button></>} />
    <div className="wb-metrics">{metrics.map(({ label, value, unit, detail, icon: Icon, tab, tone }) => <button className={`wb-metric ${tone}`} onClick={() => onNavigate(tab)} key={label}><span className="wb-metric-label">{label}<Icon size={17} /></span><strong>{value}<small>{unit}</small></strong><span>{detail}<ArrowUpRight size={13} /></span></button>)}</div>
    <div className="wb-overview-grid">
      <Panel title="繼續你的申請" icon={<GraduationCap size={17} />} action={<button className="wb-text-button" onClick={() => onNavigate('programs')}>全部學程<ArrowRight size={13} /></button>}>
        <div className="wb-resume-list">{ranked.map((program) => <button key={program.id} onClick={() => onOpen(program.id)}><SchoolIcon program={program} /><span className="wb-resume-school"><strong>{program.programName}</strong><small>{program.university}</small><span className="wb-progress-line"><span style={{ width: `${program.completion}%` }} /></span></span><span className="wb-resume-status"><span className={`wb-badge status-${program.status.toLowerCase()}`}>{statusLabel(program.status)}</span><small>{program.completion}% 完成</small></span><Chevron /></button>)}{!ranked.length && <p className="wb-empty">目前沒有追蹤中的學程。</p>}</div>
        <button className="wb-panel-bottom" onClick={() => onNavigate('compare')}><span>還在選擇？把學程放在一起比較</span><ArrowRight size={15} /></button>
      </Panel>
      <Panel title="近期官方截止日" icon={<CalendarDays size={17} />} action={<span className="wb-count">{deadlines.length}</span>}>
        <div className="wb-deadlines">{deadlines.map((program) => <button key={program.id} onClick={() => onOpen(program.id)}><span className="wb-date-block"><small>{new Date(dateNumber(program.deadline)).toLocaleDateString('en', { month: 'short' }).toUpperCase()}</small><strong>{new Date(dateNumber(program.deadline)).getDate()}</strong></span><span><strong>{program.programName}</strong><small>{program.university} · {dateText(program.deadline)}</small><span className={`wb-evidence ${fieldText(program.row, 'Deadline Status') === 'confirmed' ? 'confirmed' : ''}`}>{fieldText(program.row, 'Evidence Category')}</span></span></button>)}{!deadlines.length && <p className="wb-empty">尚無可辨識的未來截止日，請到學程頁確認官方来源。</p>}</div><p className="wb-panel-caption">個人目標日另列於待辦；未公布日期不作官方承諾。</p>
      </Panel>
      <Panel title="接下來要做的事" icon={<CheckCircle2 size={17} />} action={<span className="wb-muted">含逾期的個人目標</span>}>
        <div className="wb-task-list">{tasks.slice(0, 4).map((row) => <button key={row.__id} onClick={() => onOpen(makeProgramKey(getValue(row, 'University'), getValue(row, 'Program')))}><span className="wb-task-circle" /><span><strong>{fieldText(row, 'Task')}</strong><small>{fieldText(row, 'University')} · {fieldText(row, 'Program')}</small></span><span className={`wb-task-date ${dateNumber(getValue(row, 'My Target Deadline')) < now.getTime() ? 'overdue' : ''}`}><Clock3 size={12} />{formatDate(getValue(row, 'My Target Deadline')) === 'Unknown' ? '未定日期' : formatDate(getValue(row, 'My Target Deadline'))}</span></button>)}{!tasks.length && <p className="wb-empty">所有已記錄的任務都完成了。</p>}</div>
      </Panel>
      <Panel title="申請資料，準備好了嗎？" icon={<Files size={17} />}>
        <div className="wb-document-summary">{['CV', 'SOP', 'LoR', '成績單'].map((category) => <button key={category} onClick={() => onNavigate('documents')}><span className="wb-mini-file"><Files size={17} /></span><span><strong>{category}</strong><small>{files.filter((doc) => doc.category === category).length} 份文件</small></span><ArrowUpRight size={15} /></button>)}</div><button className="wb-panel-bottom" onClick={() => onNavigate('documents')}><span>開啟我的文件庫</span><ArrowRight size={15} /></button>
      </Panel>
    </div>
    <p className="wb-footnote">從左側選擇一個學程，即可開啟它的完整申請工作區。</p>
  </section>
}
function Chevron() { return <ArrowUpRight className="wb-muted" size={16} /> }
