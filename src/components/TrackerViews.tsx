import { useEffect, useMemo, useRef, useState } from 'react'
import {
  closestCorners,
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  AlertTriangle,
  ArrowDownAZ,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  Download,
  ExternalLink,
  FileJson,
  FileSpreadsheet,
  Filter,
  GripVertical,
  PanelRightClose,
  RefreshCcw,
  Search,
  SlidersHorizontal,
  Table2,
  Upload,
  UserRoundSearch,
  UsersRound,
} from 'lucide-react'
import type { CellValue, DataRow, PersistedTracker, ProgramView, WorkbookModel } from '../types'
import { CHECKLIST_FIELDS, checklistStatuses, displayValue, downloadJsonBackup, formatDate, getValue, isChecklistDone, PRE_UPDATE_BACKUP_KEY, PROGRAM_STATUS_ORDER, toDateInput } from '../lib/workbook'
import { statusLabel } from '../lib/status'
import { ProgramQuickPreview } from './ProgramQuickPreview'
type EditHandler = (row: DataRow, field: string, value: CellValue) => void
const completedStatuses = { has: (value: string) => isChecklistDone(value) }
function programDraggableId(program: ProgramView) {
  return `program:${program.row.__sheet}:${program.row.__row}`
}

function statusDroppableId(status: string) {
  return `status:${encodeURIComponent(status)}`
}

const kanbanCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args)
  if (pointerCollisions.length > 0) {
    const cardCollision = pointerCollisions.find((collision) => {
      const container = args.droppableContainers.find((item) => item.id === collision.id)
      return container?.data.current?.type === 'program'
    })
    return cardCollision ? [cardCollision] : pointerCollisions
  }
  return closestCorners(args)
}

function valueAsDate(value: CellValue): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

function statusTone(status: string) {
  const lower = status.toLowerCase()
  if (lower.includes('complete') || lower.includes('verified') || lower.includes('admitted'))
    return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  if (lower.includes('progress') || lower.includes('preparing') || lower.includes('interview'))
    return 'bg-amber-50 text-amber-800 ring-amber-200'
  if (lower.includes('waiting') || lower.includes('submitted')) return 'bg-sky-50 text-sky-700 ring-sky-200'
  if (lower.includes('rejected') || lower.includes('withdrawn')) return 'bg-rose-50 text-rose-700 ring-rose-200'
  return 'bg-stone-100 text-stone-700 ring-stone-200'
}

function StatusBadge({ value }: { value: string }) {
  return (
    <span className={classNames('inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset', statusTone(value))}>
      {value || 'Unknown'}
    </span>
  )
}

function EmptyValue({ children }: { children?: string }) {
  return <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800">{children || 'Unknown'}</span>
}

export function DatasetUpgradeStrip({ onReload }: { onReload: () => void }) {
  return (
    <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-950 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <RefreshCcw className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
        <div>
          <p className="text-sm font-bold">新版 Excel 已可使用</p>
          <p className="mt-1 text-xs leading-5 text-sky-800">
            新版已重新查閱 24 所學校的學程與招生資訊，加入多輪截止日、官方來源與查證狀態。切換時會保留可對應的修改與選校結果，並備份目前資料。
          </p>
        </div>
      </div>
      <button
        onClick={onReload}
        data-testid="reload-updated-workbook"
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-sky-800"
      >
        <RefreshCcw className="h-4 w-4" />重新載入新版 Excel
      </button>
    </div>
  )
}

export function WarningStrip({ warnings }: { warnings: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/75 p-3.5 text-amber-950">
      <button onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-3 text-left">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
        <span className="flex-1 text-xs font-semibold">資料完整性提醒：{warnings.length} 項欄位差異；網站會繼續運作，不會捏造缺少資料。</span>
        <ChevronRight className={classNames('h-4 w-4 transition-transform', open && 'rotate-90')} />
      </button>
      {open && <ul className="mt-3 space-y-1 border-t border-amber-200 pt-3 pl-8 text-xs leading-5 text-amber-800">{warnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul>}
    </div>
  )
}

export function ProgramsBoard({ programs, onOpenProgram, onEdit, embedded = false }: { programs: ProgramView[]; onOpenProgram: (id: string) => void; onEdit: EditHandler; embedded?: boolean }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('All')
  const [degree, setDegree] = useState('All')
  const [competitiveness, setCompetitiveness] = useState('All')
  const [area, setArea] = useState('')
  const [sort, setSort] = useState('rank')
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  )
  const statuses = useMemo(() => [...new Set([...PROGRAM_STATUS_ORDER, ...programs.map((program) => program.status)])], [programs])
  const degrees = [...new Set(programs.map((program) => program.degree))].sort()
  const competitivenessOptions = [...new Set(programs.map((program) => program.competitiveness))].sort()
  const filtered = useMemo(() => {
    if (embedded) return programs
    const query = search.trim().toLowerCase()
    const result = programs.filter((program) => {
      const haystack = `${program.university} ${program.programName} ${program.degree} ${program.researchAreas} ${program.nextAction}`.toLowerCase()
      return (!query || haystack.includes(query)) && (status === 'All' || program.status === status) && (degree === 'All' || program.degree === degree) && (competitiveness === 'All' || program.competitiveness === competitiveness) && (!area.trim() || program.researchAreas.toLowerCase().includes(area.trim().toLowerCase()))
    })
    return [...result].sort((a, b) => {
      if (sort === 'deadline') return (valueAsDate(a.deadline)?.getTime() ?? Infinity) - (valueAsDate(b.deadline)?.getTime() ?? Infinity)
      if (sort === 'fit') return Number(b.researchFitScore ?? 0) - Number(a.researchFitScore ?? 0)
      if (sort === 'completion') return b.completion - a.completion
      if (sort === 'university') return a.university.localeCompare(b.university)
      return Number(getValue(a.row, 'Desirability Rank') ?? 999) - Number(getValue(b.row, 'Desirability Rank') ?? 999)
    })
  }, [area, competitiveness, degree, programs, search, sort, status, embedded])

  useEffect(() => {
    const ids = programs.map(programDraggableId)
    if (new Set(ids).size !== ids.length) {
      console.error('[GraduateTracker:DnD] Duplicate draggable ids detected', ids)
    }
  }, [programs])

  function handleDragStart(event: DragStartEvent) {
    const draggableId = String(event.active.id)
    setActiveId(draggableId)
    console.debug('[GraduateTracker:DnD] Drag started', {
      draggableId,
      activeData: event.active.data.current,
    })
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const activeData = event.active.data.current
    const overData = event.over?.data.current
    const programId = String(activeData?.programId ?? '')
    const program = programs.find((item) => item.id === programId)
    const targetStatus = String(overData?.status ?? '').trim()
    const debug = {
      activeId: String(event.active.id),
      overId: event.over ? String(event.over.id) : null,
      activeData,
      overData,
      resolvedProgramId: programId,
      sourceStatus: program?.status,
      targetStatus,
    }

    if (!event.over) {
      console.warn('[GraduateTracker:DnD] Drop failed: no droppable target', debug)
      return
    }
    if (!program) {
      console.error('[GraduateTracker:DnD] Drop failed: program lookup failed', debug)
      return
    }
    if (!targetStatus || !statuses.includes(targetStatus)) {
      console.error('[GraduateTracker:DnD] Drop failed: invalid target status', debug)
      return
    }
    if (targetStatus === program.status) {
      console.debug('[GraduateTracker:DnD] Drop completed in the same status', debug)
      return
    }

    console.debug('[GraduateTracker:DnD] Application Status update', debug)
    onEdit(program.row, 'Application Status', targetStatus)
  }

  return (
    <section>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">{programs.length}-program pipeline</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Programs Kanban</h1><p className="mt-2 text-sm text-stone-500">拖拉卡片即可同步更新 Excel 的 Application Status。</p></div><div className="flex items-center gap-2 text-xs text-stone-500"><GripVertical className="h-4 w-4" />拖拉狀態 · 點擊查看完整資料</div></div>
      <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
        <div className="grid gap-2 lg:grid-cols-[minmax(240px,1.5fr)_repeat(4,minmax(150px,.7fr))]">
          <label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜尋學校、program、research area…" className="h-10 w-full rounded-xl border border-stone-200 bg-stone-50 pl-9 pr-3 text-xs outline-none focus:border-emerald-400" /></label>
          <FilterSelect value={degree} onChange={setDegree} options={['All', ...degrees]} label="Degree" />
          <FilterSelect value={competitiveness} onChange={setCompetitiveness} options={['All', ...competitivenessOptions]} label="Competitiveness" />
          <label className="relative"><Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" /><input value={area} onChange={(event) => setArea(event.target.value)} placeholder="Research area" className="h-10 w-full rounded-xl border border-stone-200 bg-stone-50 pl-9 pr-3 text-xs outline-none focus:border-emerald-400" /></label>
          <label className="relative"><ArrowDownAZ className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" /><select value={sort} onChange={(event) => setSort(event.target.value)} className="h-10 w-full appearance-none rounded-xl border border-stone-200 bg-stone-50 pl-9 pr-3 text-xs font-medium outline-none focus:border-emerald-400"><option value="rank">Desirability Rank</option><option value="deadline">Deadline</option><option value="fit">Research Fit</option><option value="completion">Completion</option><option value="university">University</option></select></label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3"><span className="text-[11px] font-semibold text-stone-500">Status</span>{['All', ...statuses].map((item) => <button key={item} onClick={() => setStatus(item)} className={classNames('rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset', status === item ? 'bg-[#173f35] text-white ring-[#173f35]' : 'bg-stone-50 text-stone-600 ring-stone-200')}>{item}</button>)}<span className="ml-auto text-[11px] text-stone-400">{filtered.length} / {programs.length}</span></div>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={kanbanCollisionDetection}
        onDragStart={handleDragStart}
        onDragCancel={() => {
          console.warn('[GraduateTracker:DnD] Drag cancelled', { activeId })
          setActiveId(null)
        }}
        onDragEnd={handleDragEnd}
      >
        <div className="mt-5 flex gap-4 overflow-x-auto pb-4">
          {statuses.map((columnStatus) => <KanbanColumn key={columnStatus} status={columnStatus} statuses={statuses} programs={filtered.filter((program) => program.status === columnStatus)} onOpenProgram={onOpenProgram} onEdit={onEdit} />)}
        </div>
        <DragOverlay adjustScale dropAnimation={{ duration: 180, easing: 'ease-out' }}>
          {activeId ? (() => {
            const activeProgram = programs.find((program) => programDraggableId(program) === activeId)
            return activeProgram ? <div className="w-[312px]"><ProgramCard program={activeProgram} statuses={statuses} onOpen={() => {}} onStatusChange={() => {}} overlay /></div> : null
          })() : null}
        </DragOverlay>
      </DndContext>
    </section>
  )
}

function FilterSelect({ value, onChange, options, label }: { value: string; onChange: (value: string) => void; options: string[]; label: string }) {
  return <label className="relative"><SlidersHorizontal className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" /><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full appearance-none rounded-xl border border-stone-200 bg-stone-50 pl-9 pr-3 text-xs font-medium outline-none focus:border-emerald-400">{options.map((option) => <option key={option}>{option}</option>)}</select></label>
}

function KanbanColumn({ status, statuses, programs, onOpenProgram, onEdit }: { status: string; statuses: string[]; programs: ProgramView[]; onOpenProgram: (id: string) => void; onEdit: EditHandler }) {
  const droppableId = statusDroppableId(status)
  const { setNodeRef, isOver } = useDroppable({ id: droppableId, data: { type: 'column', status } })
  return <div ref={setNodeRef} data-testid={`status-column-${status}`} data-droppable-id={droppableId} className={classNames('w-[312px] shrink-0 rounded-2xl border p-3 transition-colors', isOver ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200' : 'border-stone-200 bg-stone-100/65')}><div className="flex items-center justify-between px-1 pb-3"><div className="flex items-center gap-2"><span className={classNames('h-2.5 w-2.5 rounded-full', status === 'Shortlisted' ? 'bg-emerald-500' : status === 'Preparing' ? 'bg-amber-500' : status === 'Submitted' ? 'bg-sky-500' : 'bg-stone-400')} /><h2 className="text-xs font-bold uppercase tracking-wide text-stone-700">{statusLabel(status)}</h2></div><span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-stone-500 ring-1 ring-stone-200">{programs.length}</span></div><SortableContext items={programs.map(programDraggableId)} strategy={verticalListSortingStrategy}><div className="min-h-24 space-y-3">{programs.map((program) => <SortableProgramCard key={program.id} program={program} statuses={statuses} onOpen={() => onOpenProgram(program.id)} onStatusChange={(nextStatus) => onEdit(program.row, 'Application Status', nextStatus)} />)}{!programs.length && <div className="grid h-24 place-items-center rounded-xl border border-dashed border-stone-300 text-[11px] text-stone-400">拖拉 program 到這裡</div>}</div></SortableContext></div>
}

function SortableProgramCard({ program, statuses, onOpen, onStatusChange }: { program: ProgramView; statuses: string[]; onOpen: () => void; onStatusChange: (status: string) => void }) {
  const draggableId = programDraggableId(program)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: draggableId,
    data: { type: 'program', programId: program.id, status: program.status },
  })
  return <div ref={setNodeRef} data-testid="program-card" data-program-id={program.id} data-draggable-id={draggableId} data-program-status={program.status} style={{ transform: CSS.Transform.toString(transform), transition, touchAction: 'manipulation' }} className={classNames(isDragging && 'opacity-30')}><ProgramCard program={program} statuses={statuses} onOpen={onOpen} onStatusChange={onStatusChange} dragProps={{ ...attributes, ...listeners }} /></div>
}

function ProgramCard({ program, statuses, onOpen, onStatusChange, overlay, dragProps }: { program: ProgramView; statuses: string[]; onOpen: () => void; onStatusChange: (status: string) => void; overlay?: boolean; dragProps?: Record<string, unknown> }) {
  const card = <article className={classNames('rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition', overlay ? 'rotate-2 border-emerald-300 shadow-2xl ring-2 ring-emerald-100' : 'hover:border-emerald-300 hover:shadow-md')}><div className="flex items-start gap-2">{!overlay && <button {...dragProps} onClick={(event) => event.stopPropagation()} data-testid="drag-handle" className="mt-0.5 cursor-grab touch-none rounded-lg border border-transparent p-1 text-stone-400 hover:border-stone-200 hover:bg-stone-50 hover:text-stone-700 active:cursor-grabbing" aria-label={`拖拉 ${program.university} ${program.programName}`} title="拖拉以變更 Application Status"><GripVertical className="h-4 w-4" /></button>}<button onClick={onOpen} className="min-w-0 flex-1 text-left"><p className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700">{program.university}</p><h3 className="mt-1 line-clamp-2 text-sm font-bold leading-5 text-stone-900">{program.programName}</h3></button><span className="rounded-md bg-stone-100 px-2 py-1 text-[10px] font-bold text-stone-600">{program.degree}</span></div><button onClick={onOpen} className="mt-3 block w-full text-left"><div className="grid grid-cols-2 gap-2 rounded-xl bg-stone-50 p-3"><CardFact label="官方截止" value={formatDate(program.deadline)} /><CardFact label="內部目標" value={formatDate(program.targetDeadline)} /><CardFact label="Research fit" value={program.researchFitScore ? `${displayValue(program.researchFitScore)} / 10` : 'Unknown'} /><CardFact label="Competitiveness" value={program.competitiveness} /></div><p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-stone-400">Next action</p><p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-stone-700">{program.nextAction}</p><div className="mt-4"><div className="mb-1.5 flex items-center justify-between text-[10px]"><span className="font-semibold text-stone-500">Checklist</span><span className="font-bold text-emerald-700">{program.completion}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-[#2b7a62]" style={{ width: `${program.completion}%` }} /></div></div></button>{overlay ? <div className="mt-3"><StatusBadge value={program.status} /></div> : <label className="mt-3 block border-t border-stone-100 pt-3" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}><span className="text-[9px] font-bold uppercase tracking-wide text-stone-400">Application Status</span><select data-testid="application-status-select" aria-label={`${program.university} ${program.programName} Application Status`} value={program.status} onChange={(event) => onStatusChange(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-stone-200 bg-white px-2.5 text-xs font-semibold text-stone-700 outline-none focus:border-emerald-400">{statuses.map((status) => <option key={status} value={status}>{statusLabel(status) || '未設定'}</option>)}</select></label>}</article>
  return overlay ? card : <ProgramQuickPreview program={program}>{card}</ProgramQuickPreview>
}

function CardFact({ label, value }: { label: string; value: string }) { return <div><p className="text-[9px] font-semibold uppercase tracking-wide text-stone-400">{label}</p><p className="mt-1 line-clamp-2 text-[11px] font-semibold leading-4 text-stone-700">{value === 'Unknown' ? <EmptyValue /> : value}</p></div> }

function DrawerShell({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  const drawerRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    drawerRef.current?.querySelector<HTMLButtonElement>('button[aria-label="關閉"]')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); return }
      if (event.key !== 'Tab') return
      const focusable = Array.from(drawerRef.current?.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, summary, [tabindex="0"]') ?? []).filter((el) => el.getClientRects().length && !el.hasAttribute('disabled'))
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', onKey); previousFocus?.focus() }
  }, [])
  return <div ref={drawerRef} role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[70] flex justify-end"><button className="absolute inset-0 bg-stone-950/35 backdrop-blur-[2px]" onClick={onClose} aria-label="關閉詳情" /><aside className="animate-slide-in relative h-full w-full max-w-3xl overflow-y-auto bg-[#f8f8f5] shadow-2xl"><header className="sticky top-0 z-10 flex items-start justify-between border-b border-stone-200 bg-white/95 px-5 py-4 backdrop-blur-xl sm:px-7"><div className="min-w-0 pr-4"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">Program detail</p><h2 className="mt-1 text-lg font-bold">{title}</h2><p className="mt-1 text-xs leading-5 text-stone-500">{subtitle}</p></div><button onClick={onClose} className="rounded-xl border border-stone-200 bg-white p-2 text-stone-500 hover:text-stone-900" aria-label="關閉"><PanelRightClose className="h-5 w-5" /></button></header><div className="p-5 sm:p-7">{children}</div></aside></div>
}

function DetailGroup({ title, icon: Icon, children }: { title: string; icon: typeof BookOpen; children: React.ReactNode }) { return <section className="mt-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"><div className="mb-4 flex items-center gap-2 border-b border-stone-100 pb-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><Icon className="h-4 w-4" /></span><h3 className="text-sm font-bold">{title}</h3></div><div className="space-y-3">{children}</div></section> }

function MissingField({ field }: { field: string }) { return <div><p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">{field}</p><div className="mt-1"><EmptyValue>Excel 無此欄位</EmptyValue></div></div> }

function EditableField({ row, field, value, onEdit }: { row: DataRow; field: string; value: CellValue; onEdit: EditHandler }) {
  const isDate = value instanceof Date || /Deadline$|Date$/.test(field)
    && !/Cycle|Zone|Evidence/.test(field)
  const isNumber = field === 'Research Fit Score' || field === 'Desirability Rank'
  const isLong = /Reason|Information|Notes|Materials|Ecosystem|Evidence|Requirement|Accessibility|Type|Areas|Preparation|Cycle|Tuition|Cost|Fellowship|Contact/.test(field)
  const common = 'mt-1 w-full rounded-lg border border-transparent bg-stone-50 px-2.5 py-2 text-xs leading-5 text-stone-700 outline-none hover:border-stone-200 focus:border-emerald-400 focus:bg-white'
  return <label className="block"><span className="text-[10px] font-bold uppercase tracking-wide text-stone-400">{field}</span>{isLong ? <textarea rows={2} value={value == null ? '' : String(value)} onChange={(event) => onEdit(row, field, event.target.value)} placeholder="Unknown" className={common} /> : <input type={isDate ? 'date' : isNumber ? 'number' : 'text'} step={isNumber ? '0.1' : undefined} value={isDate ? toDateInput(value) : value == null ? '' : String(value)} onChange={(event) => onEdit(row, field, isDate ? (event.target.value ? new Date(`${event.target.value}T00:00:00`) : null) : isNumber ? (event.target.value ? Number(event.target.value) : null) : event.target.value)} placeholder="Unknown" className={common} />}</label>
}

const facultyThemeOptions = ['All', 'AI for Science', 'Scientific Machine Learning', 'Physical Simulation', 'Medical AI／WSI', 'Continual Learning', 'Efficient／Adaptive ML']

function themeMatches(row: DataRow, theme: string) {
  if (theme === 'All') return true
  const text = `${displayValue(getValue(row, 'Matching Research Theme'))} ${displayValue(getValue(row, 'Research Areas'))} ${displayValue(getValue(row, 'Why This Faculty Matches My Background'))}`.toLowerCase()
  const tokens: Record<string, string[]> = { 'AI for Science': ['ai for science'], 'Scientific Machine Learning': ['scientific machine learning'], 'Physical Simulation': ['physical simulation', 'simulation'], 'Medical AI／WSI': ['medical ai', 'medical-ai', 'wsi', 'pathology'], 'Continual Learning': ['continual learning'], 'Efficient／Adaptive ML': ['efficient', 'adaptive', 'distribution shift'] }
  return (tokens[theme] ?? [theme.toLowerCase()]).some((token) => text.includes(token))
}

export function FacultyExplorer({ model, onOpenFaculty }: { model: WorkbookModel; onOpenFaculty: (id: string) => void }) {
  const [search, setSearch] = useState('')
  const [theme, setTheme] = useState('All')
  const [fit, setFit] = useState('All')
  const [view, setView] = useState<'cards' | 'table'>('cards')
  const fits = ['All', ...new Set(model.faculty.map((row) => displayValue(getValue(row, 'Primary／Secondary Fit'))))]
  const filtered = model.faculty.filter((row) => { const query = search.toLowerCase(); const text = Object.values(row.values).map((value) => displayValue(value)).join(' ').toLowerCase(); return (!query || text.includes(query)) && themeMatches(row, theme) && (fit === 'All' || displayValue(getValue(row, 'Primary／Secondary Fit')) === fit) })
  return <section><div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Research fit explorer</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Faculty Explorer</h1><p className="mt-2 text-sm text-stone-500">使用原始 tags 與文字篩選，不建立不存在的 faculty matrix 分數。</p></div><div className="inline-flex self-start rounded-xl border border-stone-200 bg-white p-1"><button onClick={() => setView('cards')} className={classNames('rounded-lg p-2', view === 'cards' ? 'bg-[#173f35] text-white' : 'text-stone-500')} aria-label="卡片檢視"><UserRoundSearch className="h-4 w-4" /></button><button onClick={() => setView('table')} className={classNames('rounded-lg p-2', view === 'table' ? 'bg-[#173f35] text-white' : 'text-stone-500')} aria-label="表格檢視"><Table2 className="h-4 w-4" /></button></div></div><div className="mt-6 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm"><div className="flex flex-col gap-2 lg:flex-row"><label className="relative min-w-64 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜尋 faculty、lab、research areas…" className="h-10 w-full rounded-xl border border-stone-200 bg-stone-50 pl-9 pr-3 text-xs outline-none focus:border-emerald-400" /></label><FilterSelect value={fit} onChange={setFit} options={fits} label="Primary／Secondary Fit" /></div><div className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">{facultyThemeOptions.map((item) => <button key={item} onClick={() => setTheme(item)} className={classNames('rounded-full px-3 py-1.5 text-[11px] font-semibold ring-1 ring-inset', theme === item ? 'bg-[#173f35] text-white ring-[#173f35]' : 'bg-stone-50 text-stone-600 ring-stone-200')}>{item}</button>)}<span className="ml-auto text-[11px] text-stone-400">{filtered.length} faculty</span></div></div>{view === 'cards' ? <div className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{filtered.map((row) => <FacultyCard key={row.__id} row={row} onOpen={() => onOpenFaculty(row.__id)} />)}</div> : <FacultyTable rows={filtered} onOpen={onOpenFaculty} />}</section>
}

function FacultyCard({ row, onOpen }: { row: DataRow; onOpen: () => void }) { return <button onClick={onOpen} className="rounded-2xl border border-stone-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700">{displayValue(getValue(row, 'University'))}</p><h2 className="mt-1 text-base font-bold">{displayValue(getValue(row, 'Faculty Name'))}</h2><p className="mt-1 text-xs text-stone-500">{displayValue(getValue(row, 'Title'))}</p></div><StatusBadge value={displayValue(getValue(row, 'Primary／Secondary Fit'))} /></div><div className="mt-4 flex flex-wrap gap-1.5">{displayValue(getValue(row, 'Matching Research Theme')).split(/\s*\/\s*|\s*;\s*/).slice(0, 3).map((tag) => <span key={tag} className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">{tag}</span>)}</div><p className="mt-4 line-clamp-3 text-xs leading-5 text-stone-600">{displayValue(getValue(row, 'Why This Faculty Matches My Background'))}</p><div className="mt-4 grid grid-cols-3 gap-2 border-t border-stone-100 pt-4"><FacultyFact label="Lab" value={displayValue(getValue(row, 'Lab'))} /><FacultyFact label="Accepting" value={displayValue(getValue(row, 'Accepting Students'))} /><FacultyFact label="Contact" value={displayValue(getValue(row, 'Contact Status'))} /></div></button> }
function FacultyFact({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><p className="text-[9px] font-bold uppercase tracking-wide text-stone-400">{label}</p><p className="mt-1 truncate text-[10px] font-semibold text-stone-700">{value}</p></div> }

function FacultyTable({ rows, onOpen }: { rows: DataRow[]; onOpen: (id: string) => void }) { return <div className="mt-5 overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm"><table className="w-full min-w-[1080px] border-collapse text-left text-xs"><thead><tr className="border-b border-stone-200 bg-stone-50 text-[10px] uppercase tracking-wide text-stone-500">{['Faculty', 'University／Program', 'Lab', 'Research Areas', 'Fit', 'Accepting Students', 'Should Contact', 'Contact Status'].map((header) => <th key={header} className="px-4 py-3 font-bold">{header}</th>)}</tr></thead><tbody className="divide-y divide-stone-100">{rows.map((row) => <tr key={row.__id} onClick={() => onOpen(row.__id)} className="cursor-pointer hover:bg-emerald-50/40"><td className="px-4 py-3"><p className="font-bold">{displayValue(getValue(row, 'Faculty Name'))}</p><p className="mt-1 text-[10px] text-stone-500">{displayValue(getValue(row, 'Title'))}</p></td><td className="max-w-52 px-4 py-3"><p className="truncate font-semibold">{displayValue(getValue(row, 'University'))}</p><p className="mt-1 truncate text-[10px] text-stone-500">{displayValue(getValue(row, 'Program'))}</p></td><td className="max-w-36 truncate px-4 py-3">{displayValue(getValue(row, 'Lab'))}</td><td className="max-w-64 px-4 py-3"><p className="line-clamp-2">{displayValue(getValue(row, 'Research Areas'))}</p></td><td className="px-4 py-3"><StatusBadge value={displayValue(getValue(row, 'Primary／Secondary Fit'))} /></td><td className="px-4 py-3">{displayValue(getValue(row, 'Accepting Students'))}</td><td className="px-4 py-3">{displayValue(getValue(row, 'Should Contact'))}</td><td className="px-4 py-3"><StatusBadge value={displayValue(getValue(row, 'Contact Status'))} /></td></tr>)}</tbody></table></div> }

export function FacultyDrawer({ row, onClose, onEdit }: { row: DataRow; onClose: () => void; onEdit: EditHandler }) {
  const fields = ['Title', 'Department', 'Lab', 'Research Areas', 'Matching Research Theme', 'Why This Faculty Matches My Background', 'Primary／Secondary Fit', 'Accepting Students', 'Accepting Master’s Students', 'Should Contact', 'Contact Email', 'Contact Timing', 'Contact Status', 'Reply Summary', 'Follow-up Date', 'Confidence Level', '3–5 Relevant Recent Papers', 'Recent Student Publications', 'Evidence of Master’s Supervision', 'Funding Evidence']
  const urls = displayValue(getValue(row, 'Source URLs')).split(/\s*;\s*/).filter((url) => /^https?:\/\//.test(url))
  return <DrawerShell title={displayValue(getValue(row, 'Faculty Name'))} subtitle={`${displayValue(getValue(row, 'University'))} · ${displayValue(getValue(row, 'Program'))}`} onClose={onClose}><div className="flex flex-wrap gap-2"><StatusBadge value={displayValue(getValue(row, 'Primary／Secondary Fit'))} /><StatusBadge value={displayValue(getValue(row, 'Contact Status'))} /></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><DetailGroup title="Faculty profile" icon={UserRoundSearch}>{fields.slice(0, 8).map((field) => field in row.values ? <EditableField key={field} row={row} field={field} value={getValue(row, field)} onEdit={onEdit} /> : <MissingField key={field} field={field} />)}</DetailGroup><DetailGroup title="Outreach & availability" icon={UsersRound}>{fields.slice(8, 16).map((field) => field in row.values ? <EditableField key={field} row={row} field={field} value={getValue(row, field)} onEdit={onEdit} /> : <MissingField key={field} field={field} />)}</DetailGroup></div><DetailGroup title="Evidence & recent work" icon={BookOpen}>{fields.slice(16).map((field) => field in row.values ? <EditableField key={field} row={row} field={field} value={getValue(row, field)} onEdit={onEdit} /> : <MissingField key={field} field={field} />)}</DetailGroup><DetailGroup title="Faculty／Lab／Paper links" icon={ExternalLink}><div className="flex flex-wrap gap-2">{urls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold hover:border-emerald-300 hover:text-emerald-700">Source {index + 1}<ExternalLink className="h-3.5 w-3.5" /></a>)}{displayValue(getValue(row, 'Contact Email')).includes('@') && <a href={`mailto:${getValue(row, 'Contact Email')}`} className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold">Email<ExternalLink className="h-3.5 w-3.5" /></a>}</div><div className="mt-3"><MissingField field="Last Verified Date（Faculty sheet 無此欄）" /></div></DetailGroup></DrawerShell>
}

export function ChecklistPage({ programs, onEdit, focusProgramId }: { programs: ProgramView[]; onEdit: EditHandler; focusProgramId?: string | null }) {
  const [selected, setSelected] = useState(focusProgramId ?? programs[0]?.id ?? '')
  const [search, setSearch] = useState('')
  const filteredPrograms = programs.filter((program) => `${program.university} ${program.programName}`.toLowerCase().includes(search.toLowerCase()))
  const program = programs.find((item) => item.id === selected) ?? filteredPrograms[0]
  useEffect(() => {
    if (focusProgramId && programs.some((item) => item.id === focusProgramId)) {
      setSelected(focusProgramId)
    } else if (programs.length && !programs.some((item) => item.id === selected)) {
      setSelected(programs[0]!.id)
    }
  }, [focusProgramId, programs, selected])
  return <section><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Per-program progress</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Application Checklist</h1><p className="mt-2 text-sm text-stone-500">所有狀態都會即時同步至原 workbook 的 Application Checklist sheet。</p></div><div className="mt-6 grid gap-5 xl:grid-cols-[300px_1fr]"><aside className="self-start rounded-2xl border border-stone-200 bg-white p-3 shadow-sm xl:sticky xl:top-24"><label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜尋 program…" className="h-10 w-full rounded-xl border border-stone-200 bg-stone-50 pl-9 pr-3 text-xs outline-none" /></label><div className="mt-3 max-h-[68vh] space-y-1 overflow-y-auto">{filteredPrograms.map((item) => <button key={item.id} onClick={() => setSelected(item.id)} className={classNames('w-full rounded-xl p-3 text-left', item.id === program?.id ? 'bg-[#173f35] text-white' : 'hover:bg-stone-50')}><span className={classNames('block truncate text-[10px] font-bold uppercase tracking-wide', item.id === program?.id ? 'text-lime-200' : 'text-emerald-700')}>{item.university}</span><span className="mt-1 block truncate text-xs font-semibold">{item.programName}</span><div className={classNames('mt-2 h-1 overflow-hidden rounded-full', item.id === program?.id ? 'bg-white/15' : 'bg-stone-100')}><div className={classNames('h-full', item.id === program?.id ? 'bg-lime-200' : 'bg-emerald-600')} style={{ width: `${item.completion}%` }} /></div></button>)}</div></aside>{program?.checklistRow ? <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-col gap-3 border-b border-stone-100 pb-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold text-emerald-700">{program.university}</p><h2 className="mt-1 text-xl font-bold">{program.programName}</h2></div><div className="text-left sm:text-right"><p className="text-3xl font-bold text-[#173f35]">{program.completion}%</p><p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">completion</p></div></div><ChecklistGrid row={program.checklistRow} onEdit={onEdit} /><div className="mt-6 grid gap-4 border-t border-stone-100 pt-5 md:grid-cols-2"><EditableField row={program.checklistRow} field="Current Blocker" value={getValue(program.checklistRow, 'Current Blocker')} onEdit={onEdit} /><EditableField row={program.checklistRow} field="Next Action" value={getValue(program.checklistRow, 'Next Action')} onEdit={onEdit} /><EditableField row={program.checklistRow} field="Target Date" value={getValue(program.checklistRow, 'Target Date')} onEdit={onEdit} /></div></div> : <div className="grid min-h-72 place-items-center rounded-3xl border border-dashed border-amber-300 bg-amber-50 text-sm font-semibold text-amber-800">此 program 找不到 checklist row。</div>}</div></section>
}

export function ChecklistGrid({ row, onEdit, compact }: { row: DataRow; onEdit: EditHandler; compact?: boolean }) {
  const fields = CHECKLIST_FIELDS.filter((field) => field in row.values)
  return <div className={classNames('grid gap-2', compact ? 'sm:grid-cols-2' : 'mt-6 sm:grid-cols-2 2xl:grid-cols-3')}>{fields.map((field) => { const value = displayValue(getValue(row, field)); return <label key={field} className="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50/60 p-3"><span className={classNames('grid h-8 w-8 shrink-0 place-items-center rounded-lg', completedStatuses.has(value) ? 'bg-emerald-100 text-emerald-700' : value === 'In progress' ? 'bg-amber-100 text-amber-700' : 'bg-stone-200 text-stone-500')}>{completedStatuses.has(value) ? <Check className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-bold uppercase tracking-wide text-stone-500">{field}</span><select value={value} onChange={(event) => onEdit(row, field, event.target.value)} className="mt-1 w-full bg-transparent text-xs font-semibold text-stone-800 outline-none">{checklistStatuses(field, value).map((status) => <option key={status} value={status}>{statusLabel(status) || '未設定'}</option>)}</select></span></label> })}</div>
}

export function UpgradeBackup() {
  const [snapshot] = useState(() => {
    try { return localStorage.getItem(PRE_UPDATE_BACKUP_KEY) } catch { return null }
  })
  if (!snapshot) return null
  return <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4"><div><p className="text-sm font-semibold text-emerald-900">升級前資料已保留</p><p className="mt-1 text-xs leading-5 text-emerald-700">可對應的修改已帶入新版。改名且無法對應的任務或欄位保留在此備份，可下載後還原或查閱。</p></div><button onClick={() => downloadJsonBackup(JSON.parse(snapshot) as PersistedTracker)} className="rounded-md border border-emerald-300 bg-white px-3 py-2 text-xs text-emerald-800">下載升級前備份</button></div>
}

export function DataCenter({ model, fileName, editCount, onExcelImport, onExportExcel, onExportCsv, onExportJson, onImportJson, onReset }: { model: WorkbookModel; fileName: string; editCount: number; onExcelImport: () => void; onExportExcel: () => void; onExportCsv: () => void; onExportJson: () => void; onImportJson: () => void; onReset: () => void }) {
  return <section><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Workbook control</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">資料與匯出</h1><p className="mt-2 text-sm text-stone-500">保留原始 sheet names 與結構；網頁修改會先保存在本機，登入雲端後自動同步。</p></div><div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4"><ActionCard icon={Upload} title="Import Updated Excel" description="載入新版 .xlsx，解析所有 sheets。" action="選擇 Excel" onClick={onExcelImport} /><ActionCard icon={FileSpreadsheet} title="Export Updated Excel" description="把 UI 修改同步回正確 sheets。" action="匯出 .xlsx" onClick={onExportExcel} /><ActionCard icon={FileSpreadsheet} title="學程 CSV" description="以學程為主，包含最新選校結果與欄位修改。" action="匯出 .csv" onClick={onExportCsv} /><ActionCard icon={FileJson} title="JSON Backup" description="備份目前 workbook 來源與所有修改。" action="匯出 JSON" onClick={onExportJson} /><ActionCard icon={Download} title="Import JSON Backup" description="在此裝置還原先前備份。" action="匯入 JSON" onClick={onImportJson} /></div><div className="mt-6 grid gap-5 xl:grid-cols-[1fr_340px]"><div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-stone-100 p-5"><div><h2 className="font-bold">Workbook sheets</h2><p className="mt-1 text-xs text-stone-500">{fileName}</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{model.sheetSummaries.length} sheets</span></div><div className="divide-y divide-stone-100">{model.sheetSummaries.map((sheet) => <div key={sheet.name} className="flex items-center gap-4 px-5 py-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-stone-100 text-stone-600"><Table2 className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{sheet.name}</p><p className="mt-1 truncate text-[11px] text-stone-500">{sheet.headers.filter(Boolean).slice(0, 5).join(' · ') || '排版式 sheet'}</p></div><div className="shrink-0 text-right"><p className="text-xs font-bold">{sheet.rows} × {sheet.columns}</p><p className="mt-1 text-[10px] text-stone-400">rows × cols</p></div></div>)}</div></div><aside className="space-y-5"><div className="rounded-3xl bg-[#173f35] p-5 text-white"><p className="text-xs font-semibold text-emerald-100/70">Local changes</p><p className="mt-2 text-4xl font-bold">{editCount}</p><p className="mt-2 text-xs leading-5 text-emerald-100/60">Reload 後仍會保留。匯出 Excel 或 JSON 可建立可攜式副本。</p></div><div className="rounded-3xl border border-rose-200 bg-rose-50 p-5"><RefreshCcw className="h-5 w-5 text-rose-600" /><h2 className="mt-3 text-sm font-bold text-rose-950">Reset to Original Excel</h2><p className="mt-2 text-xs leading-5 text-rose-800">清除 localStorage 內的所有修改，重新讀取專案原始檔。原始 `.xlsx` 不會被覆蓋。</p><button onClick={onReset} className="mt-4 w-full rounded-xl border border-rose-300 bg-white px-3 py-2.5 text-xs font-bold text-rose-700 hover:bg-rose-100">重設（會再次確認）</button></div></aside></div></section>
}

function ActionCard({ icon: Icon, title, description, action, onClick }: { icon: typeof Upload; title: string; description: string; action: string; onClick: () => void }) { return <button onClick={onClick} className="group rounded-2xl border border-stone-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Icon className="h-5 w-5" /></span><h2 className="mt-4 text-sm font-bold">{title}</h2><p className="mt-2 min-h-10 text-xs leading-5 text-stone-500">{description}</p><span className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">{action}<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" /></span></button> }
