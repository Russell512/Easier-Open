import { useMemo, useState } from 'react'
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
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  AlertTriangle,
  Download,
  Filter,
  GripVertical,
  ListOrdered,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import type {
  CompetitivenessCategory,
  ProgramView,
  SchoolSelectionState,
  WorkbookModel,
} from '../types'
import { displayValue, formatDate, getValue, makeProgramKey, toDateInput } from '../lib/workbook'
import {
  COMPETITIVENESS_CATEGORIES,
  createInitialSchoolSelection,
  fundingSummary,
  hasCompetitivenessConflict,
  summaryCompetitivenessDrivers,
} from '../lib/selection'
import { ProgramQuickPreview } from './ProgramQuickPreview'

type SelectionTab = 'desirability' | 'competitiveness'

interface SchoolSelectionPageProps {
  model: WorkbookModel
  programs: ProgramView[]
  selection: SchoolSelectionState
  onChange: (selection: SchoolSelectionState) => void
  onOpenProgram: (id: string) => void
  onExport: () => void
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

function desirabilityDraggableId(program: ProgramView) {
  return `desire:${program.row.__sheet}:${program.row.__row}`
}

function competitivenessDraggableId(program: ProgramView) {
  return `competition:${program.row.__sheet}:${program.row.__row}`
}

function competitivenessColumnId(category: CompetitivenessCategory) {
  return `competition-column:${encodeURIComponent(category)}`
}

const competitionCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args)
  if (pointerCollisions.length > 0) {
    const cardCollision = pointerCollisions.find((collision) => {
      const container = args.droppableContainers.find((item) => item.id === collision.id)
      return container?.data.current?.type === 'competition-program'
    })
    return cardCollision ? [cardCollision] : pointerCollisions
  }
  return closestCorners(args)
}

function sourceLabel(source: SchoolSelectionState['rankingInitialization']) {
  if (source === 'personal-rank') return 'Excel Personal Desirability Rank'
  if (source === 'desirability-rank') return 'Excel Desirability Rank'
  if (source === 'summary-ranking') return 'Summary and Ranking sheet'
  if (source === 'research-fit') return '系統初始排序'
  return '使用者排序'
}

function categoryTone(category: CompetitivenessCategory) {
  if (category === '相對穩健') return 'bg-emerald-50 text-emerald-800 ring-emerald-200'
  if (category === '合理競爭') return 'bg-sky-50 text-sky-800 ring-sky-200'
  if (category === '高度競爭') return 'bg-rose-50 text-rose-800 ring-rose-200'
  return 'bg-stone-100 text-stone-700 ring-stone-200'
}

export function SchoolSelectionPage({
  model,
  programs,
  selection,
  onChange,
  onOpenProgram,
  onExport,
}: SchoolSelectionPageProps) {
  const [tab, setTab] = useState<SelectionTab>('desirability')
  const [search, setSearch] = useState('')
  const [degree, setDegree] = useState('All')
  const [area, setArea] = useState('')
  const degrees = useMemo(() => [...new Set(programs.map((program) => program.degree))].sort(), [programs])
  const programById = useMemo(
    () => new Map(programs.map((program) => [program.id, program])),
    [programs],
  )
  const filteredIds = useMemo(() => {
    const query = search.trim().toLowerCase()
    const researchArea = area.trim().toLowerCase()
    return new Set(programs.filter((program) => {
      const text = `${program.university} ${program.programName} ${program.degree} ${program.researchAreas}`.toLowerCase()
      return (!query || text.includes(query))
        && (degree === 'All' || program.degree === degree)
        && (!researchArea || program.researchAreas.toLowerCase().includes(researchArea))
    }).map((program) => program.id))
  }, [area, degree, programs, search])
  const filteredPrograms = programs.filter((program) => filteredIds.has(program.id))

  function resetRanking() {
    if (!window.confirm('確定要重設想去程度排名與排序備註嗎？目前的手動排序將被清除。')) return
    const initial = createInitialSchoolSelection(model)
    onChange({
      ...selection,
      rankingOrder: initial.rankingOrder,
      rankingNotes: initial.rankingNotes,
      rankingInitialization: initial.rankingInitialization,
    })
  }

  function resetClassification() {
    if (!window.confirm('確定要重設競爭程度分類、備註與更新日期嗎？目前的手動分類將被清除。')) return
    const initial = createInitialSchoolSelection(model)
    onChange({
      ...selection,
      competitivenessCategories: initial.competitivenessCategories,
      competitivenessNotes: initial.competitivenessNotes,
      classificationUpdated: initial.classificationUpdated,
    })
  }

  return (
    <section data-testid="selection-page">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Two independent views</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">選校排序</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-500">
            將「你有多想去」與「申請有多競爭」分開判斷；本頁不建立或顯示混合總分。
          </p>
        </div>
        <button
          onClick={onExport}
          data-testid="selection-export-excel"
          className="inline-flex self-start items-center gap-2 rounded-xl bg-[#173f35] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#205647]"
        >
          <Download className="h-4 w-4" />Export Updated Excel
        </button>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2" role="tablist" aria-label="選校排序模式">
        <button
          role="tab"
          aria-selected={tab === 'desirability'}
          onClick={() => setTab('desirability')}
          className={classNames(
            'rounded-2xl border p-4 text-left transition',
            tab === 'desirability'
              ? 'border-emerald-300 bg-[#173f35] text-white shadow-md'
              : 'border-stone-200 bg-white text-stone-800 hover:border-emerald-300',
          )}
        >
          <span className="flex items-center gap-2 text-sm font-bold"><ListOrdered className="h-4 w-4" />想去程度排名</span>
          <span className={classNames('mt-2 block text-xs leading-5', tab === 'desirability' ? 'text-emerald-50/75' : 'text-stone-500')}>
            不考慮錄取機率，只比較 program 對你的吸引力。
          </span>
        </button>
        <button
          role="tab"
          aria-selected={tab === 'competitiveness'}
          onClick={() => setTab('competitiveness')}
          className={classNames(
            'rounded-2xl border p-4 text-left transition',
            tab === 'competitiveness'
              ? 'border-emerald-300 bg-[#173f35] text-white shadow-md'
              : 'border-stone-200 bg-white text-stone-800 hover:border-emerald-300',
          )}
        >
          <span className="flex items-center gap-2 text-sm font-bold"><SlidersHorizontal className="h-4 w-4" />錄取競爭程度</span>
          <span className={classNames('mt-2 block text-xs leading-5', tab === 'competitiveness' ? 'text-emerald-50/75' : 'text-stone-500')}>
            只比較申請難度。熱門 CS／AI programs 沒有真正可靠的 safety。
          </span>
        </button>
      </div>

      <div className="mt-5 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
        <div className="grid gap-2 lg:grid-cols-[minmax(260px,1fr)_220px_minmax(220px,.8fr)_auto]">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜尋學校、program、research area…"
              className="h-10 w-full rounded-xl border border-stone-200 bg-stone-50 pl-9 pr-3 text-xs outline-none focus:border-emerald-400"
            />
          </label>
          <label className="relative">
            <SlidersHorizontal className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <select
              aria-label="Degree"
              value={degree}
              onChange={(event) => setDegree(event.target.value)}
              className="h-10 w-full appearance-none rounded-xl border border-stone-200 bg-stone-50 pl-9 pr-3 text-xs font-medium outline-none focus:border-emerald-400"
            >
              {['All', ...degrees].map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label className="relative">
            <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              value={area}
              onChange={(event) => setArea(event.target.value)}
              placeholder="Research area"
              className="h-10 w-full rounded-xl border border-stone-200 bg-stone-50 pl-9 pr-3 text-xs outline-none focus:border-emerald-400"
            />
          </label>
          <button
            onClick={tab === 'desirability' ? resetRanking : resetClassification}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-4 text-xs font-bold text-stone-700 hover:border-rose-300 hover:text-rose-700"
          >
            <RotateCcw className="h-4 w-4" />{tab === 'desirability' ? 'Reset Ranking' : 'Reset Classification'}
          </button>
        </div>
        <p className="mt-3 border-t border-stone-100 pt-3 text-right text-[11px] text-stone-400">
          顯示 {filteredPrograms.length} / {programs.length} programs
        </p>
      </div>

      {tab === 'desirability' ? (
        <DesirabilityRanking
          programs={programs}
          programById={programById}
          visibleIds={filteredIds}
          selection={selection}
          onChange={onChange}
          onOpenProgram={onOpenProgram}
        />
      ) : (
        <CompetitivenessBoard
          model={model}
          programs={programs}
          visibleIds={filteredIds}
          selection={selection}
          onChange={onChange}
          onOpenProgram={onOpenProgram}
        />
      )}
    </section>
  )
}

function DesirabilityRanking({
  programs,
  programById,
  visibleIds,
  selection,
  onChange,
  onOpenProgram,
}: {
  programs: ProgramView[]
  programById: Map<string, ProgramView>
  visibleIds: Set<string>
  selection: SchoolSelectionState
  onChange: (selection: SchoolSelectionState) => void
  onOpenProgram: (id: string) => void
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  )
  const orderedPrograms = selection.rankingOrder
    .map((id) => programById.get(id))
    .filter((program): program is ProgramView => Boolean(program))
  const visiblePrograms = orderedPrograms.filter((program) => visibleIds.has(program.id))
  const activeProgram = programs.find((program) => desirabilityDraggableId(program) === activeId)

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const programId = String(event.active.data.current?.programId ?? '')
    const targetId = String(event.over?.data.current?.programId ?? '')
    const oldIndex = selection.rankingOrder.indexOf(programId)
    const newIndex = selection.rankingOrder.indexOf(targetId)
    if (!event.over || oldIndex < 0 || newIndex < 0) {
      console.warn('[GraduateTracker:SelectionDnD] Ranking drop failed', {
        activeId: event.active.id,
        overId: event.over?.id ?? null,
        programId,
        targetId,
        oldIndex,
        newIndex,
      })
      return
    }
    if (oldIndex === newIndex) return
    onChange({
      ...selection,
      rankingOrder: arrayMove(selection.rankingOrder, oldIndex, newIndex),
      rankingInitialization: 'user',
    })
  }

  function moveToRank(programId: string, rawRank: string) {
    const requestedRank = Number(rawRank)
    if (!Number.isInteger(requestedRank)) return
    const oldIndex = selection.rankingOrder.indexOf(programId)
    const newIndex = Math.max(0, Math.min(selection.rankingOrder.length - 1, requestedRank - 1))
    if (oldIndex < 0 || oldIndex === newIndex) return
    onChange({
      ...selection,
      rankingOrder: arrayMove(selection.rankingOrder, oldIndex, newIndex),
      rankingInitialization: 'user',
    })
  }

  return (
    <div className="mt-5">
      <div className={classNames(
        'mb-4 flex flex-col gap-2 rounded-2xl border px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between',
        selection.rankingInitialization === 'research-fit'
          ? 'border-amber-200 bg-amber-50 text-amber-900'
          : 'border-emerald-200 bg-emerald-50 text-emerald-900',
      )}>
        <span className="font-semibold">
          排序來源：{sourceLabel(selection.rankingInitialization)}
          {selection.rankingInitialization === 'research-fit' && '；這不是你的最終決定。'}
        </span>
        <span className="text-[11px] opacity-70">只比較吸引力，不納入錄取難度。</span>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={visiblePrograms.map(desirabilityDraggableId)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {visiblePrograms.map((program) => (
              <SortableDesirabilityCard
                key={program.id}
                program={program}
                rank={selection.rankingOrder.indexOf(program.id) + 1}
                note={selection.rankingNotes[program.id] ?? ''}
                onOpen={() => onOpenProgram(program.id)}
                onRankChange={(rank) => moveToRank(program.id, rank)}
                onNoteChange={(note) => onChange({
                  ...selection,
                  rankingNotes: { ...selection.rankingNotes, [program.id]: note },
                })}
              />
            ))}
          </div>
        </SortableContext>
        <DragOverlay dropAnimation={{ duration: 180, easing: 'ease-out' }}>
          {activeProgram ? (
            <div className="max-w-5xl">
              <DesirabilityCard
                program={activeProgram}
                rank={selection.rankingOrder.indexOf(activeProgram.id) + 1}
                note={selection.rankingNotes[activeProgram.id] ?? ''}
                overlay
                onOpen={() => {}}
                onRankChange={() => {}}
                onNoteChange={() => {}}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

function SortableDesirabilityCard({
  program,
  rank,
  note,
  onOpen,
  onRankChange,
  onNoteChange,
}: {
  program: ProgramView
  rank: number
  note: string
  onOpen: () => void
  onRankChange: (rank: string) => void
  onNoteChange: (note: string) => void
}) {
  const draggableId = desirabilityDraggableId(program)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: draggableId,
    data: { type: 'desirability-program', programId: program.id },
  })
  return (
    <div
      ref={setNodeRef}
      data-testid="ranking-card"
      data-program-id={program.id}
      data-rank={rank}
      data-draggable-id={draggableId}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={classNames(isDragging && 'opacity-30')}
    >
      <ProgramQuickPreview program={program}>
        <DesirabilityCard
          program={program}
          rank={rank}
          note={note}
          onOpen={onOpen}
          onRankChange={onRankChange}
          onNoteChange={onNoteChange}
          dragProps={{ ...attributes, ...listeners }}
        />
      </ProgramQuickPreview>
    </div>
  )
}

function DesirabilityCard({
  program,
  rank,
  note,
  onOpen,
  onRankChange,
  onNoteChange,
  overlay,
  dragProps,
}: {
  program: ProgramView
  rank: number
  note: string
  onOpen: () => void
  onRankChange: (rank: string) => void
  onNoteChange: (note: string) => void
  overlay?: boolean
  dragProps?: Record<string, unknown>
}) {
  return (
    <article className={classNames(
      'grid gap-4 rounded-2xl border bg-white p-4 shadow-sm transition lg:grid-cols-[76px_minmax(260px,.8fr)_minmax(420px,1.5fr)]',
      overlay ? 'rotate-1 border-emerald-300 shadow-2xl ring-2 ring-emerald-100' : 'border-stone-200 hover:border-emerald-300 hover:shadow-md',
    )}>
      <div className="flex items-start gap-2">
        {!overlay && (
          <button
            {...dragProps}
            data-testid="ranking-drag-handle"
            onClick={(event) => event.stopPropagation()}
            className="cursor-grab touch-none rounded-lg border border-stone-200 p-1.5 text-stone-400 hover:bg-stone-50 hover:text-stone-700 active:cursor-grabbing"
            aria-label={`拖拉調整 ${program.university} ${program.programName} 排名`}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wide text-stone-400">Rank</p>
          <p className="mt-1 text-3xl font-black tracking-tight text-[#173f35]">{rank}</p>
        </div>
      </div>
      <button onClick={onOpen} className="min-w-0 text-left">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700">{program.university}</p>
        <h2 className="mt-1 text-base font-bold leading-6 text-stone-900">{program.programName}</h2>
        <span className="mt-2 inline-flex rounded-md bg-stone-100 px-2 py-1 text-[10px] font-bold text-stone-600">{program.degree}</span>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <SelectionFact label="Research Fit" value={`${displayValue(program.researchFitScore)} / 10`} />
          <SelectionFact label="Research accessibility" value={displayValue(getValue(program.row, 'Master’s Research Accessibility'))} />
        </div>
      </button>
      <div className="min-w-0">
        <button onClick={onOpen} className="block w-full text-left">
          <SelectionFact label="Relevant Research Areas" value={program.researchAreas} />
          <div className="mt-3">
            <SelectionFact label="Tuition／Funding" value={fundingSummary(program)} />
          </div>
        </button>
        {!overlay && (
          <div className="mt-3 grid gap-3 border-t border-stone-100 pt-3 sm:grid-cols-[150px_1fr]">
            <label onClick={(event) => event.stopPropagation()}>
              <span className="text-[9px] font-bold uppercase tracking-wide text-stone-400">Personal Desirability Rank</span>
              <input
                type="number"
                min={1}
                value={rank}
                onChange={(event) => onRankChange(event.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-stone-200 bg-stone-50 px-2.5 text-xs font-bold outline-none focus:border-emerald-400 focus:bg-white"
              />
            </label>
            <label onClick={(event) => event.stopPropagation()}>
              <span className="text-[9px] font-bold uppercase tracking-wide text-stone-400">我的排序備註／Desirability Notes</span>
              <input
                value={note}
                onChange={(event) => onNoteChange(event.target.value)}
                placeholder="加入只與吸引力有關的排序理由…"
                className="mt-1 h-9 w-full rounded-lg border border-stone-200 bg-stone-50 px-2.5 text-xs outline-none focus:border-emerald-400 focus:bg-white"
              />
            </label>
          </div>
        )}
      </div>
    </article>
  )
}

function CompetitivenessBoard({
  model,
  programs,
  visibleIds,
  selection,
  onChange,
  onOpenProgram,
}: {
  model: WorkbookModel
  programs: ProgramView[]
  visibleIds: Set<string>
  selection: SchoolSelectionState
  onChange: (selection: SchoolSelectionState) => void
  onOpenProgram: (id: string) => void
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  )
  const drivers = useMemo(() => summaryCompetitivenessDrivers(model), [model])
  const activeProgram = programs.find((program) => competitivenessDraggableId(program) === activeId)
  const conflictCount = programs.filter(hasCompetitivenessConflict).length

  function updateCategory(programId: string, category: CompetitivenessCategory) {
    onChange({
      ...selection,
      competitivenessCategories: {
        ...selection.competitivenessCategories,
        [programId]: category,
      },
      classificationUpdated: {
        ...selection.classificationUpdated,
        [programId]: new Date().toISOString(),
      },
    })
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const programId = String(event.active.data.current?.programId ?? '')
    const category = event.over?.data.current?.category as CompetitivenessCategory | undefined
    if (!event.over || !programId || !category || !COMPETITIVENESS_CATEGORIES.includes(category)) {
      console.warn('[GraduateTracker:SelectionDnD] Competitiveness drop failed', {
        activeId: event.active.id,
        overId: event.over?.id ?? null,
        activeData: event.active.data.current,
        overData: event.over?.data.current,
        programId,
        category,
      })
      return
    }
    if (selection.competitivenessCategories[programId] === category) return
    updateCategory(programId, category)
  }

  return (
    <div className="mt-5">
      {conflictCount > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="text-xs font-bold">{conflictCount} 個 programs 的 Baseline 與 Enhanced 分類不一致</p>
            <p className="mt-1 text-[11px] leading-5 text-amber-800">
              未自行判斷衝突；初始分類優先採用 Baseline Competitiveness，並保留 Enhanced badge 供你比較與手動修改。
            </p>
          </div>
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={competitionCollisionDetection}
        onDragStart={handleDragStart}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COMPETITIVENESS_CATEGORIES.map((category) => (
            <CompetitivenessColumn
              key={category}
              category={category}
              programs={programs.filter((program) =>
                visibleIds.has(program.id)
                && selection.competitivenessCategories[program.id] === category)}
              model={model}
              drivers={drivers}
              selection={selection}
              onChange={onChange}
              onOpenProgram={onOpenProgram}
              onCategoryChange={updateCategory}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: 'ease-out' }}>
          {activeProgram ? (
            <div className="w-[340px]">
              <CompetitivenessCard
                program={activeProgram}
                model={model}
                driver={drivers[activeProgram.id]}
                category={selection.competitivenessCategories[activeProgram.id] ?? '資料不足'}
                note={selection.competitivenessNotes[activeProgram.id] ?? ''}
                updated={selection.classificationUpdated[activeProgram.id] ?? ''}
                overlay
                onOpen={() => {}}
                onCategoryChange={() => {}}
                onNoteChange={() => {}}
                onUpdatedChange={() => {}}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

function CompetitivenessColumn({
  category,
  programs,
  model,
  drivers,
  selection,
  onChange,
  onOpenProgram,
  onCategoryChange,
}: {
  category: CompetitivenessCategory
  programs: ProgramView[]
  model: WorkbookModel
  drivers: Record<string, string>
  selection: SchoolSelectionState
  onChange: (selection: SchoolSelectionState) => void
  onOpenProgram: (id: string) => void
  onCategoryChange: (programId: string, category: CompetitivenessCategory) => void
}) {
  const droppableId = competitivenessColumnId(category)
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    data: { type: 'competition-column', category },
  })
  return (
    <div
      ref={setNodeRef}
      data-testid="competitiveness-column"
      data-category={category}
      data-droppable-id={droppableId}
      className={classNames(
        'w-[340px] shrink-0 rounded-2xl border p-3 transition-colors',
        isOver ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200' : 'border-stone-200 bg-stone-100/65',
      )}
    >
      <div className="flex items-center justify-between px-1 pb-3">
        <span className={classNames('rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset', categoryTone(category))}>
          {category}
        </span>
        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-stone-500 ring-1 ring-stone-200">{programs.length}</span>
      </div>
      <SortableContext items={programs.map(competitivenessDraggableId)} strategy={verticalListSortingStrategy}>
        <div className="min-h-28 space-y-3">
          {programs.map((program) => (
            <SortableCompetitivenessCard
              key={program.id}
              program={program}
              model={model}
              driver={drivers[program.id]}
              category={category}
              note={selection.competitivenessNotes[program.id] ?? ''}
              updated={selection.classificationUpdated[program.id] ?? ''}
              onOpen={() => onOpenProgram(program.id)}
              onCategoryChange={(nextCategory) => onCategoryChange(program.id, nextCategory)}
              onNoteChange={(note) => onChange({
                ...selection,
                competitivenessNotes: { ...selection.competitivenessNotes, [program.id]: note },
              })}
              onUpdatedChange={(date) => onChange({
                ...selection,
                classificationUpdated: { ...selection.classificationUpdated, [program.id]: date },
              })}
            />
          ))}
          {!programs.length && (
            <div className="grid h-28 place-items-center rounded-xl border border-dashed border-stone-300 px-4 text-center text-[11px] leading-5 text-stone-400">
              拖拉 program 到這裡
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  )
}

function SortableCompetitivenessCard({
  program,
  model,
  driver,
  category,
  note,
  updated,
  onOpen,
  onCategoryChange,
  onNoteChange,
  onUpdatedChange,
}: {
  program: ProgramView
  model: WorkbookModel
  driver?: string
  category: CompetitivenessCategory
  note: string
  updated: string
  onOpen: () => void
  onCategoryChange: (category: CompetitivenessCategory) => void
  onNoteChange: (note: string) => void
  onUpdatedChange: (date: string) => void
}) {
  const draggableId = competitivenessDraggableId(program)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: draggableId,
    data: { type: 'competition-program', programId: program.id, category },
  })
  return (
    <div
      ref={setNodeRef}
      data-testid="competitiveness-card"
      data-program-id={program.id}
      data-category={category}
      data-draggable-id={draggableId}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={classNames(isDragging && 'opacity-30')}
    >
      <ProgramQuickPreview program={program}>
        <CompetitivenessCard
          program={program}
          model={model}
          driver={driver}
          category={category}
          note={note}
          updated={updated}
          onOpen={onOpen}
          onCategoryChange={onCategoryChange}
          onNoteChange={onNoteChange}
          onUpdatedChange={onUpdatedChange}
          dragProps={{ ...attributes, ...listeners }}
        />
      </ProgramQuickPreview>
    </div>
  )
}

function CompetitivenessCard({
  program,
  model,
  driver,
  category,
  note,
  updated,
  onOpen,
  onCategoryChange,
  onNoteChange,
  onUpdatedChange,
  overlay,
  dragProps,
}: {
  program: ProgramView
  model: WorkbookModel
  driver?: string
  category: CompetitivenessCategory
  note: string
  updated: string
  onOpen: () => void
  onCategoryChange: (category: CompetitivenessCategory) => void
  onNoteChange: (note: string) => void
  onUpdatedChange: (date: string) => void
  overlay?: boolean
  dragProps?: Record<string, unknown>
}) {
  const baseline = displayValue(getValue(program.row, 'Baseline Competitiveness'))
  const enhanced = displayValue(getValue(program.row, 'Enhanced Competitiveness'))
  const relatedFaculty = model.faculty.filter((row) =>
    makeProgramKey(getValue(row, 'University'), getValue(row, 'Program')) === program.id)
  const facultyCount = displayValue(getValue(program.row, 'Number of Relevant Faculty')) === 'Unknown'
    ? String(relatedFaculty.length)
    : displayValue(getValue(program.row, 'Number of Relevant Faculty'))
  const conflict = hasCompetitivenessConflict(program)
  return (
    <article className={classNames(
      'rounded-2xl border bg-white p-4 shadow-sm transition',
      overlay ? 'rotate-2 border-emerald-300 shadow-2xl ring-2 ring-emerald-100' : 'border-stone-200 hover:border-emerald-300 hover:shadow-md',
    )}>
      <div className="flex items-start gap-2">
        {!overlay && (
          <button
            {...dragProps}
            data-testid="competitiveness-drag-handle"
            onClick={(event) => event.stopPropagation()}
            className="mt-0.5 cursor-grab touch-none rounded-lg border border-transparent p-1 text-stone-400 hover:border-stone-200 hover:bg-stone-50 hover:text-stone-700 active:cursor-grabbing"
            aria-label={`拖拉調整 ${program.university} ${program.programName} 競爭程度`}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700">{program.university}</p>
          <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-5 text-stone-900">{program.programName}</h3>
        </button>
        <span className="rounded-md bg-stone-100 px-2 py-1 text-[10px] font-bold text-stone-600">{program.degree}</span>
      </div>
      <button onClick={onOpen} className="mt-3 block w-full text-left">
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700 ring-1 ring-rose-200">Baseline: {baseline}</span>
          <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-200">Enhanced: {enhanced}</span>
        </div>
        {conflict && (
          <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-[10px] font-semibold leading-4 text-amber-800">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />資料衝突；初始分類採用 Baseline，未覆蓋 Enhanced。
          </p>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-stone-50 p-3">
          <SelectionFact label="Research Fit" value={`${displayValue(program.researchFitScore)} / 10`} />
          <SelectionFact label="Faculty 數量" value={facultyCount} />
          <SelectionFact label="Cohort Size" value={displayValue(getValue(program.row, 'Cohort Size'))} />
          <SelectionFact label="關鍵競爭因素" value={driver || displayValue(getValue(program.row, 'Faculty Concentration Risk'))} />
        </div>
        <div className="mt-3">
          <SelectionFact
            label="分類理由"
            value={`依 Baseline Competitiveness「${baseline}」初始化；可由你手動調整最終分類。`}
          />
        </div>
      </button>
      {!overlay && (
        <div className="mt-3 space-y-3 border-t border-stone-100 pt-3">
          <label onClick={(event) => event.stopPropagation()}>
            <span className="text-[9px] font-bold uppercase tracking-wide text-stone-400">My Competitiveness Category</span>
            <select
              value={category}
              onChange={(event) => onCategoryChange(event.target.value as CompetitivenessCategory)}
              className="mt-1 h-9 w-full rounded-lg border border-stone-200 bg-stone-50 px-2.5 text-xs font-bold outline-none focus:border-emerald-400 focus:bg-white"
            >
              {COMPETITIVENESS_CATEGORIES.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label onClick={(event) => event.stopPropagation()}>
            <span className="text-[9px] font-bold uppercase tracking-wide text-stone-400">Competitiveness Notes</span>
            <textarea
              rows={2}
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder="記錄分類理由、資料缺口或需再次確認的資訊…"
              className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-2 text-xs leading-5 outline-none focus:border-emerald-400 focus:bg-white"
            />
          </label>
          <label onClick={(event) => event.stopPropagation()}>
            <span className="text-[9px] font-bold uppercase tracking-wide text-stone-400">Classification Last Updated</span>
            <input
              type="date"
              value={toDateInput(updated)}
              onChange={(event) => onUpdatedChange(event.target.value ? new Date(`${event.target.value}T00:00:00`).toISOString() : '')}
              className="mt-1 h-9 w-full rounded-lg border border-stone-200 bg-stone-50 px-2.5 text-xs outline-none focus:border-emerald-400 focus:bg-white"
            />
            {updated && <span className="mt-1 block text-[10px] text-stone-400">已記錄：{formatDate(updated)}</span>}
          </label>
        </div>
      )}
    </article>
  )
}

function SelectionFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-bold uppercase tracking-wide text-stone-400">{label}</p>
      <p className="mt-1 line-clamp-3 text-[11px] font-semibold leading-4 text-stone-700">
        {value === 'Unknown' || value.startsWith('Unknown /')
          ? <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-amber-800">Unknown</span>
          : value}
      </p>
    </div>
  )
}
