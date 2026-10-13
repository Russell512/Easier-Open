import { programSearchText } from '../../lib/workbook'
import { useState } from 'react'
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { GripVertical, Search, ArrowUpRight, ChevronRight, Download } from 'lucide-react'
import type { ProgramView, SchoolSelectionState, SelectionResult, WorkbookModel } from '../../types'
import { SELECTION_RESULTS, selectionResult } from '../../lib/selection'
import { PageHeading } from './shared'
import { SHORTLIST_RESULTS, shortlistPrograms, downloadShortlistCsv } from '../../lib/shortlistExport'
import { fieldText } from './helpers'

type Assign = (id: string, result: SelectionResult) => void

export function ResultSelect({ program, selection, onAssign }: { program: ProgramView; selection: SchoolSelectionState; onAssign: Assign }) {
  return <label className="wb-result-select"><span>選校結果</span><select aria-label={`${program.university} ${program.programName} 選校結果`} value={selectionResult(selection.results?.[program.id])} onChange={(event) => onAssign(program.id, event.target.value as SelectionResult)}>{SELECTION_RESULTS.map((category) => <option key={category}>{category}</option>)}</select></label>
}

function ResultCard({ program, selection, onAssign, onOpen }: { program: ProgramView; selection: SchoolSelectionState; onAssign: Assign; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: program.id })
  return <article ref={setNodeRef} className={`wb-result-card ${isDragging ? 'dragging' : ''}`}>
    <div className="wb-result-card-head"><span>{program.university}</span><button className="wb-drag-handle" {...attributes} {...listeners} aria-label={`拖曳 ${program.university} ${program.programName}`} title="拖曳到分類，也可用下方選單"><GripVertical size={18} /></button></div>
    <button className="wb-result-title" onClick={() => onOpen(program.id)}>{program.programName}<ArrowUpRight size={14} /></button>
    <div className="wb-result-card-footer"><p>{fieldText(program.row, 'Delivery Mode')} · {program.degree}</p><ResultSelect program={program} selection={selection} onAssign={onAssign} /></div>
  </article>
}

function ResultColumn({ category, programs, selection, onAssign, onOpen }: { category: SelectionResult; programs: ProgramView[]; selection: SchoolSelectionState; onAssign: Assign; onOpen: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `result:${category}` })
  return <section ref={setNodeRef} aria-label={`${category}分類`} className={`wb-result-column ${isOver ? 'over' : ''}`} data-category={category}>
    <header><h2>{category}</h2><span>{programs.length}</span></header>
    <div className="wb-result-column-body">{programs.map((program) => <ResultCard key={program.id} program={program} selection={selection} onAssign={onAssign} onOpen={onOpen} />)}{!programs.length && <p className="wb-result-empty">拖曳學程到這裡</p>}</div>
  </section>
}

export function SelectionResultsPage({ programs, selection, model, onAssign, onOpen, onNotify }: { model: WorkbookModel; programs: ProgramView[]; selection: SchoolSelectionState; onAssign: Assign; onOpen: (id: string) => void; onNotify: (message: string) => void }) {
  const [query, setQuery] = useState('')
  const shortlistCount = shortlistPrograms(programs, selection).length
  const [expanded, setExpanded] = useState<SelectionResult | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const ranks = new Map(selection.rankingOrder.map((id, index) => [id, index]))
  const visible = programs.filter((p) => programSearchText(p).includes(query.toLowerCase())).sort((a, b) => (ranks.get(a.id) ?? 999) - (ranks.get(b.id) ?? 999))
  const active = programs.find((p) => p.id === activeId)
  function assign(id: string, category: SelectionResult) {
    onAssign(id, category)
    const program = programs.find((p) => p.id === id)
    setAnnouncement(`${program?.university} ${program?.programName} 已移到${category}`)
  }
  return <section>
    <PageHeading title="選校結果" actions={<div className="wb-shortlist-export"><button className="wb-button" disabled={!shortlistCount} title="匯出彩票、衝刺、主申、較為保險的全部學程，不受搜尋影響" onClick={() => { downloadShortlistCsv(model, programs, selection); onNotify(`已匯出 ${shortlistCount} 個學程`) }}><Download size={15} />匯出選校 CSV<span>{shortlistCount}</span></button></div>} />
    <div className="wb-toolbar"><label className="wb-search"><Search size={16} /><input aria-label="搜尋選校結果" placeholder="搜尋學校或學程…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><span className="wb-muted">{visible.filter(p => SHORTLIST_RESULTS.includes(selectionResult(selection.results?.[p.id]))).length} 個主要候選 · {query ? `搜尋符合 ${visible.length} 個` : `共 ${programs.length} 個學程`}</span></div>
    <p className="sr-only" role="status">{announcement}</p>
    <DndContext sensors={sensors} onDragStart={({ active }) => setActiveId(String(active.id))} onDragCancel={() => setActiveId(null)} onDragEnd={({ active, over }) => {
      setActiveId(null)
      const category = SELECTION_RESULTS.find((c) => `result:${c}` === over?.id)
      if (category) assign(String(active.id), category)
    }}>
      <div className="wb-results-board">{SHORTLIST_RESULTS.map((category) => <ResultColumn key={category} category={category} programs={visible.filter((p) => selectionResult(selection.results?.[p.id]) === category)} selection={selection} onAssign={assign} onOpen={onOpen} />)}</div>
      <div className="wb-results-archive">{(['未分類', '淘汰'] as SelectionResult[]).map(category => {
        const items = visible.filter(p => selectionResult(selection.results?.[p.id]) === category)
        return <div key={category}><button className="wb-archive-toggle" aria-expanded={expanded === category} onClick={() => setExpanded(expanded === category ? null : category)}><ChevronRight size={16} /><strong>{category}</strong><span>{items.length} 個學程</span><small>{expanded === category ? '收合' : '展開查看'}</small></button>{expanded === category && <ResultColumn category={category} programs={items} selection={selection} onAssign={assign} onOpen={onOpen} />}</div>
      })}</div>
      <DragOverlay>{active && <div className="wb-result-card wb-result-overlay"><span>{active.university}</span><strong>{active.programName}</strong></div>}</DragOverlay>
    </DndContext>
  </section>
}
