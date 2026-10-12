import { saveLocalValue } from '../lib/cloudClient'
import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  BadgeCheck,
  BookOpenCheck,
  Check,
  ChevronDown,
  CircleDashed,
  Clock3,
  Download,
  FileText,
  GripVertical,
  HelpCircle,
  Lightbulb,
  LoaderCircle,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react'
import type { ProgramView } from '../types'
import {
  SOP_MATERIAL_STORAGE_KEY,
  SOP_SECTION_DEFINITIONS,
  createInitialSopMaterialBank,
  createMaterialEntry,
  exportSopMaterialBankTxt,
  getSopProgress,
  reconcileSopMaterialBank,
  type AnswerStatus,
  type MaterialAnswer,
  type MaterialEntry,
  type MaterialFieldDefinition,
  type MaterialSectionDefinition,
  type SopMaterialBankState,
  type SopSectionId,
} from '../lib/sopMaterialBank'

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

function loadMaterialBank() {
  try {
    const saved = localStorage.getItem(SOP_MATERIAL_STORAGE_KEY)
    return saved ? reconcileSopMaterialBank(JSON.parse(saved)) : createInitialSopMaterialBank()
  } catch {
    return createInitialSopMaterialBank()
  }
}

function itemSummary(definition: MaterialSectionDefinition, entry: MaterialEntry, index: number) {
  const preferredField = definition.fields.find((field) =>
    ['title', 'area', 'program', 'text'].includes(field.id))
  const value = preferredField ? entry.answers[preferredField.id]?.text.trim() : ''
  return value || `${definition.itemLabel} ${index + 1}`
}

function answerStateTone(answer: MaterialAnswer | undefined) {
  if (answer?.text.trim()) return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  if (answer?.status === 'later') return 'bg-amber-50 text-amber-700 ring-amber-200'
  if (answer?.status === 'unsure') return 'bg-sky-50 text-sky-700 ring-sky-200'
  return 'bg-stone-100 text-stone-500 ring-stone-200'
}

function answerStateLabel(answer: MaterialAnswer | undefined) {
  if (answer?.text.trim()) return '已填寫'
  if (answer?.status === 'later') return '稍後再填'
  if (answer?.status === 'unsure') return '目前不確定'
  return '待整理'
}

export function SopMaterialBankPage({ programs }: { programs: ProgramView[] }) {
  const [state, setState] = useState<SopMaterialBankState>(loadMaterialBank)
  const [openSections, setOpenSections] = useState<Set<SopSectionId>>(
    () => new Set<SopSectionId>(['research-projects']),
  )
  const [activeDrag, setActiveDrag] = useState<{ sectionId: SopSectionId; entryId: string } | null>(null)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [message, setMessage] = useState('')
  const progress = useMemo(() => getSopProgress(state), [state])
  const programSuggestions = useMemo(
    () => programs.map((program) => `${program.university} — ${program.programName} — ${program.degree}`),
    [programs],
  )
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => {
    try {
      saveLocalValue(SOP_MATERIAL_STORAGE_KEY, JSON.stringify(state))
    } catch {
      setMessage('瀏覽器儲存空間不足，請先匯出 TXT 或 PDF。')
    }
  }, [state])

  useEffect(() => {
    if (!message) return
    const timeout = window.setTimeout(() => setMessage(''), 3000)
    return () => window.clearTimeout(timeout)
  }, [message])

  function commit(updater: (current: SopMaterialBankState) => SopMaterialBankState) {
    setState((current) => ({
      ...updater(current),
      updatedAt: new Date().toISOString(),
    }))
  }

  function updateAnswer(
    sectionId: SopSectionId,
    entryId: string,
    fieldId: string,
    update: Partial<MaterialAnswer>,
  ) {
    commit((current) => ({
      ...current,
      sections: {
        ...current.sections,
        [sectionId]: current.sections[sectionId].map((entry) => entry.id === entryId
          ? {
              ...entry,
              answers: {
                ...entry.answers,
                [fieldId]: {
                  ...entry.answers[fieldId]!,
                  ...update,
                },
              },
            }
          : entry),
      },
    }))
  }

  function addEntry(definition: MaterialSectionDefinition) {
    const entries = state.sections[definition.id]
    if (definition.maxItems && entries.length >= definition.maxItems) {
      setMessage(`${definition.title} 最多建立 ${definition.maxItems} 條。`)
      return
    }
    commit((current) => ({
      ...current,
      sections: {
        ...current.sections,
        [definition.id]: [...current.sections[definition.id], createMaterialEntry(definition)],
      },
    }))
    setOpenSections((current) => new Set(current).add(definition.id))
  }

  function deleteEntry(definition: MaterialSectionDefinition, entry: MaterialEntry, index: number) {
    if (state.sections[definition.id].length <= 1) return
    if (!window.confirm(`確定刪除 ${itemSummary(definition, entry, index)}？此項內容將無法復原。`)) return
    commit((current) => ({
      ...current,
      sections: {
        ...current.sections,
        [definition.id]: current.sections[definition.id].filter((item) => item.id !== entry.id),
      },
    }))
  }

  function handleDragStart(definition: MaterialSectionDefinition, event: DragStartEvent) {
    setActiveDrag({ sectionId: definition.id, entryId: String(event.active.id) })
  }

  function handleDragEnd(definition: MaterialSectionDefinition, event: DragEndEvent) {
    setActiveDrag(null)
    if (!event.over || event.active.id === event.over.id) return
    const entries = state.sections[definition.id]
    const oldIndex = entries.findIndex((entry) => entry.id === event.active.id)
    const newIndex = entries.findIndex((entry) => entry.id === event.over?.id)
    if (oldIndex < 0 || newIndex < 0) return
    commit((current) => ({
      ...current,
      sections: {
        ...current.sections,
        [definition.id]: arrayMove(current.sections[definition.id], oldIndex, newIndex),
      },
    }))
  }

  function toggleSection(sectionId: SopSectionId) {
    setOpenSections((current) => {
      const next = new Set(current)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }

  async function exportPdf() {
    setExportingPdf(true)
    try {
      const { exportSopMaterialBankPdf } = await import('../lib/sopPdfExport')
      await exportSopMaterialBankPdf(
        state,
        `${import.meta.env.BASE_URL}assets/NotoSansTC-Regular.ttf`,
      )
      setMessage('PDF 已匯出。')
    } catch (error) {
      setMessage(error instanceof Error ? `PDF 匯出失敗：${error.message}` : 'PDF 匯出失敗。')
    } finally {
      setExportingPdf(false)
    }
  }

  const updatedTime = new Date(state.updatedAt)
  const activeDefinition = activeDrag
    ? SOP_SECTION_DEFINITIONS.find((definition) => definition.id === activeDrag.sectionId)
    : null
  const activeEntry = activeDrag && activeDefinition
    ? state.sections[activeDefinition.id].find((entry) => entry.id === activeDrag.entryId) ?? null
    : null

  return (
    <section data-testid="sop-material-bank-page">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Guided evidence collection</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">SOP Material Bank</h1>
          <p className="mt-2 text-sm leading-6 text-stone-500">
            先把真實經歷拆成可用素材，再決定如何組成 SOP。本頁不會自動生成、補寫或假設你的經歷。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              exportSopMaterialBankTxt(state)
              setMessage('TXT 已匯出。')
            }}
            data-testid="export-sop-txt"
            className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-xs font-bold text-stone-700 shadow-sm hover:border-emerald-300 hover:text-emerald-700"
          >
            <FileText className="h-4 w-4" />Export TXT
          </button>
          <button
            type="button"
            disabled={exportingPdf}
            onClick={() => void exportPdf()}
            data-testid="export-sop-pdf"
            className="inline-flex items-center gap-2 rounded-xl bg-[#173f35] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#205647] disabled:cursor-wait disabled:opacity-60"
          >
            {exportingPdf ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exportingPdf ? '正在建立 PDF…' : 'Export PDF'}
          </button>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-3xl bg-[#173f35] text-white shadow-sm">
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 text-lime-200">
              <BookOpenCheck className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold">素材整理進度</h2>
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-emerald-100">
                  {progress.answered} / {progress.total} 已填寫
                </span>
                {progress.deferred > 0 && (
                  <span className="rounded-full bg-amber-300/15 px-2.5 py-1 text-[10px] font-bold text-amber-100">
                    {progress.deferred} 待確認
                  </span>
                )}
              </div>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-emerald-50/65">
                完成度只計算實際輸入內容；「稍後再填」與「目前不確定」會保留，但不會被誤算為完成。
              </p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-lime-300 transition-[width] duration-300"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 lg:pl-6">
            <div>
              <p className="text-4xl font-bold tracking-tight text-lime-200">{progress.percent}%</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-100/50">overall</p>
            </div>
            <div className="h-12 w-px bg-white/10" />
            <div className="text-[11px] text-emerald-50/65">
              <p className="inline-flex items-center gap-1.5 font-semibold text-emerald-50">
                <Save className="h-3.5 w-3.5 text-lime-200" />自動儲存
              </p>
              <p className="mt-1">
                {Number.isNaN(updatedTime.getTime())
                  ? '剛剛更新'
                  : `最後更新 ${updatedTime.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}`}
              </p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-5 border-t border-white/10 sm:grid-cols-10">
          {SOP_SECTION_DEFINITIONS.map((definition) => {
            const sectionProgress = progress.sections[definition.id]
            return (
              <button
                key={definition.id}
                type="button"
                onClick={() => {
                  setOpenSections((current) => new Set(current).add(definition.id))
                  document.getElementById(`sop-section-${definition.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                className="border-r border-white/10 px-1 py-3 text-center hover:bg-white/5"
                aria-label={`前往 ${definition.title}`}
              >
                <span className="block text-[9px] font-bold text-emerald-100/45">{definition.number}</span>
                <span className="mt-1 block text-[10px] font-bold text-emerald-50">{sectionProgress.percent}%</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50/75 px-4 py-3 text-xs leading-5 text-sky-900">
        <span className="inline-flex items-center gap-2 font-bold"><Sparkles className="h-4 w-4 text-sky-600" />建議使用方式</span>
        <span className="ml-2 text-sky-800">一次只展開一至兩個區塊。先寫具體事實，再回頭整理語氣與故事線。</span>
      </div>

      <div className="mt-5 space-y-3">
        {SOP_SECTION_DEFINITIONS.map((definition) => (
          <MaterialSectionCard
            key={definition.id}
            definition={definition}
            entries={state.sections[definition.id]}
            progress={progress.sections[definition.id]}
            open={openSections.has(definition.id)}
            activeEntry={activeDrag?.sectionId === definition.id ? activeEntry : null}
            sensors={sensors}
            programSuggestions={programSuggestions}
            onToggle={() => toggleSection(definition.id)}
            onAdd={() => addEntry(definition)}
            onDelete={(entry, index) => deleteEntry(definition, entry, index)}
            onUpdate={(entryId, fieldId, update) => updateAnswer(definition.id, entryId, fieldId, update)}
            onDragStart={(event) => handleDragStart(definition, event)}
            onDragEnd={(event) => handleDragEnd(definition, event)}
            onDragCancel={() => setActiveDrag(null)}
          />
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold text-stone-800">內容自動保存，雲端狀態請見上方</p>
          <p className="mt-1 text-xs text-stone-500">定期匯出 TXT 或 PDF，可交給顧問閱讀或作為後續 AI 整理素材。</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => exportSopMaterialBankTxt(state)} className="rounded-xl border border-stone-200 px-3 py-2 text-xs font-bold text-stone-700 hover:border-emerald-300">Export TXT</button>
          <button type="button" onClick={() => void exportPdf()} disabled={exportingPdf} className="rounded-xl bg-[#173f35] px-3 py-2 text-xs font-bold text-white disabled:opacity-60">Export PDF</button>
        </div>
      </div>

      {message && (
        <div role="status" className="fixed bottom-5 left-1/2 z-[85] -translate-x-1/2 rounded-xl bg-stone-900 px-4 py-3 text-sm font-medium text-white shadow-2xl">
          {message}
        </div>
      )}
    </section>
  )
}

function MaterialSectionCard({
  definition,
  entries,
  progress,
  open,
  activeEntry,
  sensors,
  programSuggestions,
  onToggle,
  onAdd,
  onDelete,
  onUpdate,
  onDragStart,
  onDragEnd,
  onDragCancel,
}: {
  definition: MaterialSectionDefinition
  entries: MaterialEntry[]
  progress: { total: number; answered: number; deferred: number; percent: number }
  open: boolean
  activeEntry: MaterialEntry | null
  sensors: ReturnType<typeof useSensors>
  programSuggestions: string[]
  onToggle: () => void
  onAdd: () => void
  onDelete: (entry: MaterialEntry, index: number) => void
  onUpdate: (entryId: string, fieldId: string, update: Partial<MaterialAnswer>) => void
  onDragStart: (event: DragStartEvent) => void
  onDragEnd: (event: DragEndEvent) => void
  onDragCancel: () => void
}) {
  const complete = progress.percent === 100
  const started = progress.answered > 0 || progress.deferred > 0
  const canAdd = definition.repeatable && (!definition.maxItems || entries.length < definition.maxItems)

  return (
    <article
      id={`sop-section-${definition.id}`}
      className={classNames(
        'scroll-mt-24 overflow-hidden rounded-2xl border bg-white shadow-sm transition-colors',
        open ? 'border-emerald-200' : 'border-stone-200 hover:border-emerald-200',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-4 text-left sm:gap-4 sm:p-5"
        aria-expanded={open}
      >
        <span className={classNames(
          'grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-sm font-bold',
          complete ? 'bg-emerald-100 text-emerald-700' : started ? 'bg-amber-50 text-amber-700' : 'bg-stone-100 text-stone-500',
        )}>
          {complete ? <Check className="h-5 w-5" /> : definition.number}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-bold text-stone-900 sm:text-base">{definition.title}</span>
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-stone-500">{definition.eyebrow}</span>
          </span>
          <span className="mt-1.5 block truncate text-xs text-stone-500">{definition.description}</span>
        </span>
        <span className="hidden shrink-0 text-right sm:block">
          <span className="block text-sm font-bold text-stone-800">{progress.percent}%</span>
          <span className="mt-0.5 block text-[9px] uppercase tracking-wide text-stone-400">{progress.answered}/{progress.total} answered</span>
        </span>
        <ChevronDown className={classNames('h-5 w-5 shrink-0 text-stone-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="border-t border-stone-100 bg-stone-50/45 p-3 sm:p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-3xl text-xs leading-5 text-stone-500">{definition.description}</p>
            {definition.repeatable && (
              <button
                type="button"
                onClick={onAdd}
                disabled={!canAdd}
                className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-[#173f35] px-3.5 py-2.5 text-xs font-bold text-white hover:bg-[#205647] disabled:cursor-not-allowed disabled:bg-stone-300"
              >
                <Plus className="h-4 w-4" />
                新增 {definition.itemLabel}
                {definition.maxItems ? `（${entries.length}/${definition.maxItems}）` : ''}
              </button>
            )}
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragCancel={onDragCancel}
          >
            <SortableContext items={entries.map((entry) => entry.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {entries.map((entry, index) => (
                  <SortableMaterialEntry
                    key={entry.id}
                    definition={definition}
                    entry={entry}
                    index={index}
                    canDelete={definition.repeatable && entries.length > 1}
                    programSuggestions={programSuggestions}
                    onDelete={() => onDelete(entry, index)}
                    onUpdate={(fieldId, update) => onUpdate(entry.id, fieldId, update)}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay dropAnimation={{ duration: 180, easing: 'ease-out' }}>
              {activeEntry && (
                <div className="rounded-2xl border border-emerald-300 bg-white p-4 shadow-2xl">
                  <div className="flex items-center gap-3">
                    <GripVertical className="h-5 w-5 text-emerald-700" />
                    <span className="text-sm font-bold text-stone-900">
                      {itemSummary(definition, activeEntry, Math.max(entries.findIndex((entry) => entry.id === activeEntry.id), 0))}
                    </span>
                  </div>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>
      )}
    </article>
  )
}

function SortableMaterialEntry({
  definition,
  entry,
  index,
  canDelete,
  programSuggestions,
  onDelete,
  onUpdate,
}: {
  definition: MaterialSectionDefinition
  entry: MaterialEntry
  index: number
  canDelete: boolean
  programSuggestions: string[]
  onDelete: () => void
  onUpdate: (fieldId: string, update: Partial<MaterialAnswer>) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
    disabled: !definition.repeatable,
  })
  const completed = definition.fields.filter((field) => entry.answers[field.id]?.text.trim()).length
  const addressed = definition.fields.filter((field) => {
    const answer = entry.answers[field.id]
    return answer?.text.trim() || answer?.status !== 'active'
  }).length

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={classNames(
        'overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm',
        isDragging && 'opacity-35',
      )}
      data-testid={`sop-entry-${definition.id}-${index}`}
    >
      <div className="flex items-center gap-3 border-b border-stone-100 bg-white px-3 py-3 sm:px-4">
        {definition.repeatable && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="touch-none rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-emerald-700"
            aria-label={`拖拉重新排序 ${itemSummary(definition, entry, index)}`}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-stone-800">{itemSummary(definition, entry, index)}</p>
          <p className="mt-0.5 text-[10px] text-stone-400">{completed} 項已填寫 · {addressed} 項已檢視</p>
        </div>
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg p-2 text-stone-400 hover:bg-rose-50 hover:text-rose-600"
            aria-label={`刪除 ${itemSummary(definition, entry, index)}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-2">
        {definition.fields.map((field) => (
          <GuidedField
            key={field.id}
            definition={field}
            answer={entry.answers[field.id]!}
            list={definition.id === 'school-fit' && field.id === 'program' ? programSuggestions : undefined}
            wide={field.type !== 'text' && field.type !== 'select'}
            testId={`sop-${definition.id}-${index}-${field.id}`}
            onChange={(update) => onUpdate(field.id, update)}
          />
        ))}
      </div>
    </div>
  )
}

function GuidedField({
  definition,
  answer,
  list,
  wide,
  testId,
  onChange,
}: {
  definition: MaterialFieldDefinition
  answer: MaterialAnswer
  list?: string[]
  wide: boolean
  testId: string
  onChange: (update: Partial<MaterialAnswer>) => void
}) {
  const inputClasses = 'mt-2 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm leading-6 text-stone-800 outline-none transition focus:border-emerald-400 focus:bg-white'
  const dataListId = list ? `${testId}-suggestions` : undefined

  function setStatus(status: Exclude<AnswerStatus, 'active'>) {
    onChange({ status: answer.status === status ? 'active' : status })
  }

  return (
    <div className={classNames('min-w-0 rounded-xl border border-stone-100 bg-white p-3.5', wide && 'xl:col-span-2')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={testId} className="text-xs font-bold text-stone-800">{definition.label}</label>
          <p className="mt-1 text-[11px] leading-4 text-stone-500">{definition.guide}</p>
        </div>
        <span className={classNames('shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ring-1 ring-inset', answerStateTone(answer))}>
          {answerStateLabel(answer)}
        </span>
      </div>

      {definition.type === 'select' ? (
        <select
          id={testId}
          data-testid={testId}
          value={answer.text}
          onChange={(event) => onChange({ text: event.target.value, status: 'active' })}
          className={inputClasses}
        >
          <option value="">請選擇</option>
          {definition.options?.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : definition.type === 'text' ? (
        <>
          <input
            id={testId}
            data-testid={testId}
            value={answer.text}
            list={dataListId}
            onChange={(event) => onChange({ text: event.target.value, status: 'active' })}
            placeholder={answer.status === 'later' ? '已標記稍後再填' : answer.status === 'unsure' ? '已標記目前不確定' : definition.placeholder}
            className={inputClasses}
          />
          {list && <datalist id={dataListId}>{list.map((item) => <option key={item} value={item} />)}</datalist>}
        </>
      ) : (
        <textarea
          id={testId}
          data-testid={testId}
          value={answer.text}
          rows={definition.rows ?? 4}
          onChange={(event) => onChange({ text: event.target.value, status: 'active' })}
          placeholder={answer.status === 'later' ? '已標記稍後再填' : answer.status === 'unsure' ? '已標記目前不確定' : '記錄具體情境、行動與結果…'}
          className={classNames(inputClasses, 'resize-y')}
        />
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setStatus('later')}
          className={classNames(
            'inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-bold ring-1 ring-inset',
            answer.status === 'later' ? 'bg-amber-100 text-amber-800 ring-amber-200' : 'bg-white text-stone-500 ring-stone-200 hover:bg-amber-50',
          )}
        >
          <Clock3 className="h-3 w-3" />稍後再填
        </button>
        <button
          type="button"
          onClick={() => setStatus('unsure')}
          className={classNames(
            'inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-bold ring-1 ring-inset',
            answer.status === 'unsure' ? 'bg-sky-100 text-sky-800 ring-sky-200' : 'bg-white text-stone-500 ring-stone-200 hover:bg-sky-50',
          )}
        >
          <HelpCircle className="h-3 w-3" />目前不確定
        </button>
        <details className="group ml-auto">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50">
            <Lightbulb className="h-3 w-3" />查看示例
          </summary>
          <div className="mt-2 rounded-lg border border-emerald-100 bg-emerald-50/65 p-2.5 text-[10px] leading-4 text-emerald-900">
            <span className="font-bold">僅示範回答結構：</span>{definition.example}
          </div>
        </details>
      </div>
    </div>
  )
}

export function SopMaterialBankNavigationBadge({ state }: { state?: SopMaterialBankState }) {
  if (!state) return <CircleDashed className="h-3.5 w-3.5" />
  const progress = getSopProgress(state)
  return progress.percent === 100
    ? <BadgeCheck className="h-3.5 w-3.5" />
    : <span className="text-[9px] font-bold">{progress.percent}%</span>
}
