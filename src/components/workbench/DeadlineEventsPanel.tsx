import { CalendarDays } from 'lucide-react'
import type { ProgramView } from '../../types'
import { DEADLINE_EVIDENCE, getDeadlineEvents, deadlineStatusText } from '../../lib/admissions'
import { getValue } from '../../lib/workbook'
import { Panel, SourceLink } from './shared'
import { fieldText } from './helpers'

export function DeadlineEventsPanel({ program }: { program: ProgramView }) {
  const events = getDeadlineEvents(program.row)
  const status = String(getValue(program.row, 'Deadline Status') ?? '')
  if (!status && !events.length) return null
  return <Panel title="各類截止日與招生狀態" icon={<CalendarDays size={17} />}>
    <div className="wb-panel-body wb-admission-status">
      <span className={`wb-evidence ${status === 'confirmed' ? 'confirmed' : ''}`}>{deadlineStatusText(program.row)}</span>
      <p className="wb-reading">{fieldText(program.row, 'Deadline Cycle')}</p>
      {!events.length && <p className="wb-muted">{status === 'closed' ? '已確認本輪不接受申請，原截止日已移除。' : status === 'rolling' ? '全年接受申請，請預留審查與開課註冊時間。' : '目前沒有可明確對應本輪的日期；查核結果與官方來源保留在此。'}</p>}
      <SourceLink value={getValue(program.row, 'Admissions/Deadline Source URL')}>查看本學程官方招生說明</SourceLink>
    </div>
    {events.length > 0 && <ol className="wb-admission-events">{events.map((event, i) => <li key={`${event.date}-${event.type}-${i}`}>
      <div className="wb-admission-event-heading"><strong>{event.type}</strong><span className={`wb-evidence ${event.evidence === 'confirmed' ? 'confirmed' : ''}`}>{DEADLINE_EVIDENCE[event.evidence]}</span></div>
      <p><time dateTime={event.date}>{event.date.replaceAll('-', '/')}</time>{event.time && <> · {event.time}</>}{event.zone && <small> {event.zone}</small>}</p>
      {event.taipei && <p className="wb-muted">台北時間：{event.taipei}</p>}
      {event.notes && <p className="wb-reading">{event.notes}</p>}
      <SourceLink value={event.source}>官方來源</SourceLink>
    </li>)}</ol>}
    <p className="wb-panel-caption">各輪次、申請身分與入學學期分開列示。官網只列月日的日期標為年度待複核；缺少明確時刻時不推算台北時間。</p>
  </Panel>
}
