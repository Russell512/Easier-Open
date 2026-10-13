import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeftRight, BookOpen, Check, ChevronLeft, ChevronRight, CircleHelp, Columns3, Database, Files, GraduationCap, LayoutDashboard, ListChecks, ListOrdered, Menu, NotebookPen, PanelLeftClose, Search, UsersRound, X } from 'lucide-react'
import type { AppTab, ProgramView } from '../../types'
import { workspacePage, type WorkspacePage, type WorkspacePane } from '../../lib/workspaceTabs'
import { NotesList } from '../NotesPage'
import type { ApplicationNotesController } from '../../hooks/useApplicationNotes'
import { WorkspacePanes } from './WorkspacePanes'
import { dragPage, readDraggedPage } from '../../lib/pageDrag'

export const WORKSPACE_NAV = [
  { id: 'dashboard', label: '工作台', icon: LayoutDashboard },
  { id: 'programs', label: '所有學程', icon: GraduationCap },
  { id: 'compare', label: '學程比較', icon: ArrowLeftRight },
  { id: 'documents', label: '我的文件', icon: Files },
  { id: 'checklist', label: '材料進度', icon: ListChecks },
  { id: 'results', label: '選校結果', icon: Columns3 },
  { id: 'selection', label: '選校排序', icon: ListOrdered },
  { id: 'faculty', label: '教授探索', icon: UsersRound },
  { id: 'sop-materials', label: 'SOP 素材', icon: BookOpen },
  { id: 'notes', label: '筆記與待辦', icon: NotebookPen },
  { id: 'data', label: '資料與備份', icon: Database },
] satisfies Array<{ id: AppTab; label: string; icon: typeof LayoutDashboard }>

function panelId(id: string) { return `workspace-panel-${encodeURIComponent(id)}` }
function tabId(id: string) { return `workspace-tab-${encodeURIComponent(id)}` }

export function WorkbenchShell({ tab, selectedProgram, programs, pages, panes, activeId, onActivate, onClose, onSplit, onResize, notes, onOpenNote, compareCount, editCount, saveError, onNavigate, onSearch, onHelp, children }: {
  tab: AppTab; selectedProgram: ProgramView | null; programs: ProgramView[]; compareCount: number; editCount: number; saveError: boolean;
  panes: WorkspacePane[]; onSplit: (page: WorkspacePage, targetId?: string, side?: 'left' | 'right') => void; onResize: (index: number, size: number) => void; notes: ApplicationNotesController; onOpenNote: (id: string) => void;
  pages: WorkspacePage[]; activeId: string; onActivate: (id: string) => void; onClose: (id: string) => void;
  onNavigate: (tab: AppTab) => void; onSearch: () => void; onHelp: () => void; children: (page: WorkspacePage) => ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const mainRef = useRef<HTMLElement>(null)
  const tabsRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef(new Map<string, HTMLButtonElement>())
  function activate(id: string) { setMobileOpen(false); onActivate(id) }
  function close(id: string) {
    const hadFocus = tabRefs.current.get(id)?.parentElement?.contains(document.activeElement)
    onClose(id)
    if (hadFocus) requestAnimationFrame(() => tabsRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus({ preventScroll: true }))
  }
  function focusTab(index: number) {
    const page = pages[(index + pages.length) % pages.length]
    if (!page) return
    activate(page.id)
    tabRefs.current.get(page.id)?.focus({ preventScroll: true })
  }
  function visit(nextTab: AppTab) { setMobileOpen(false); onNavigate(nextTab) }
  const pageTitle = WORKSPACE_NAV.find((item) => item.id === tab)?.label ?? '工作台'
  function titleOf(page: WorkspacePage) {
    if (page.noteId) return notes.state.notes.find(note => note.id === page.noteId)?.title.trim() || '未命名筆記'
    const program = programs.find(p => p.id === page.school)
    return program ? `${program.university} · ${program.programName}` : WORKSPACE_NAV.find(item => item.id === page.tab)?.label || '工作台'
  }
  useLayoutEffect(() => {
    const scroller = tabsRef.current
    const active = tabRefs.current.get(activeId)?.parentElement
    if (!scroller || !active) return
    const left = active.offsetLeft
    const right = left + active.offsetWidth
    if (left < scroller.scrollLeft) scroller.scrollLeft = left
    else if (right > scroller.scrollLeft + scroller.clientWidth) scroller.scrollLeft = right - scroller.clientWidth
  }, [activeId, pages.length, collapsed])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMobileOpen(false); setDraggingId(null) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return <div className={`wb-shell ${collapsed ? 'sidebar-collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`} onDragStart={event => { const page = readDraggedPage(event.dataTransfer); if (page) setDraggingId(page.id) }} onDragEnd={() => setDraggingId(null)} onDrop={() => setDraggingId(null)}>
    <a className="wb-skip" href="#workspace-content" onClick={(event) => { event.preventDefault(); mainRef.current?.querySelector<HTMLElement>('.wb-pane.focused [role="tabpanel"]')?.focus() }}>跳至主要內容</a>
    <header className="wb-titlebar">
      <button className="wb-brand" onClick={() => visit('dashboard')} aria-label="Easier 工作台"><span className="wb-brand-mark">e</span><strong>Easier</strong><span className="wb-version">WORKSPACE</span></button>
      <button className="wb-command" onClick={onSearch} aria-label="搜尋學校、教授或功能"><Search size={14} /><span>搜尋學校、教授或功能…</span><kbd>⌘ K</kbd></button>
      <div className="wb-titlebar-right"><span className="wb-cycle">FALL 2027</span><span className="wb-avatar" title="你的申請工作區">e</span></div>
    </header>
    <div className="wb-body">

      {mobileOpen && <button className="wb-nav-scrim" aria-label="關閉導覽遮罩" onClick={() => setMobileOpen(false)} />}
      <aside className="wb-sidebar" aria-label="工作區導覽">
        <div className="wb-sidebar-title"><span>申請工作區</span><div className="wb-sidebar-tools"><button className="wb-icon-button" aria-label="使用說明" title="使用說明" onClick={onHelp}><CircleHelp size={15} /></button><button className="wb-icon-button" aria-label="收合側欄" onClick={() => { setCollapsed(true); setMobileOpen(false) }}><PanelLeftClose size={15} /></button></div></div>
        <div className="wb-sidebar-scroll"><nav className="wb-navigation" aria-label="主要導覽">{WORKSPACE_NAV.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => visit(id)} aria-current={!selectedProgram && tab === id ? 'page' : undefined}><Icon size={16} /><span>{label}</span>{id === 'compare' && compareCount > 0 ? <small>{compareCount}</small> : id === 'programs' ? <small>{programs.length}</small> : null}</button>)}</nav>
          <NotesList compact notes={notes} onOpen={id => { setMobileOpen(false); onOpenNote(id) }} />
        </div>
        <button className="wb-sidebar-footer" onClick={() => visit('data')}><Database size={15} /><span>申請工作區<small>管理資料與備份</small></span><ChevronRight size={13} /></button>
      </aside>
      <div className="wb-editor">
        <div className="wb-editor-tabs">
          <button className="wb-sidebar-toggle" aria-label="展開側欄" onClick={() => { setCollapsed(false); setMobileOpen(!mobileOpen) }}><Menu size={18} /></button>
          <div ref={tabsRef} className="wb-tabs-scroll" role="tablist" aria-multiselectable="true" aria-label="已開啟的工作區分頁" aria-orientation="horizontal" onWheel={(event) => {
            if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) event.currentTarget.scrollLeft += event.deltaY
          }}>
            {pages.map((page, index) => {
              const program = programs.find((item) => item.id === page.school)
              const nav = WORKSPACE_NAV.find((item) => item.id === page.tab)!
              const Icon = page.noteId ? NotebookPen : program ? GraduationCap : nav.icon
              const title = titleOf(page)
              const label = page.noteId ? title : program ? program.university.replace(/^(?:The )?University of /, '').replace(/ University$/, '') : nav.label
              return <div key={page.id} draggable onDragStart={event => { dragPage(event, page, title) }} role="presentation" className={`wb-workspace-tab ${page.id === activeId ? 'active' : ''}`} onMouseDown={(event) => { if (event.button === 1) event.preventDefault() }} onAuxClick={(event) => { if (event.button === 1) { event.preventDefault(); close(page.id) } }}>
                <button ref={(element) => { if (element) tabRefs.current.set(page.id, element); else tabRefs.current.delete(page.id) }} role="tab" id={tabId(page.id)} aria-controls={panelId(page.id)} aria-selected={panes.some(p => p.pageId === page.id)} aria-label={title} tabIndex={page.id === activeId ? 0 : -1} className="wb-tab-select" title={title} onClick={() => activate(page.id)} onKeyDown={(event) => {
                  if (['ArrowRight', 'ArrowLeft', 'Home', 'End', 'Delete'].includes(event.key)) event.preventDefault()
                  if (event.key === 'ArrowRight') focusTab(index + 1)
                  if (event.key === 'ArrowLeft') focusTab(index - 1)
                  if (event.key === 'Home') focusTab(0)
                  if (event.key === 'End') focusTab(pages.length - 1)
                  if (event.key === 'Delete') close(page.id)
                }}><Icon size={14} /><span className="wb-tab-label">{label}{program && <small>{program.programName}</small>}</span></button>
                <button className="wb-tab-close" aria-label={`關閉分頁：${title}`} title="關閉分頁（也可按滑鼠中鍵）" tabIndex={page.id === activeId ? 0 : -1} onClick={() => close(page.id)}><X size={13} /></button>
              </div>
            })}
          </div>
          <div className="wb-tab-scroll-actions"><button aria-label="分頁列向左捲動" title="分頁列向左捲動" onClick={() => tabsRef.current?.scrollBy({ left: -240, behavior: 'smooth' })}><ChevronLeft size={15} /></button><button aria-label="分頁列向右捲動" title="分頁列向右捲動" onClick={() => tabsRef.current?.scrollBy({ left: 240, behavior: 'smooth' })}><ChevronRight size={15} /></button></div>
        </div>
        <div className="wb-breadcrumb"><label className="wb-split-control"><Columns3 size={13} /><select aria-label="在右側並排開啟" value="" disabled={panes.length >= 4} onChange={event => { const page = pages.find(p => p.id === event.target.value) ?? (event.target.value.startsWith('note:') ? workspacePage('notes', null, event.target.value.slice(5)) : workspacePage('programs', event.target.value.slice(7))); onSplit(page) }}><option value="">{panes.length >= 4 ? '已開啟 4 欄' : '並排開啟…'}</option><optgroup label="功能分頁">{pages.filter(p => !p.school && !p.noteId && !panes.some(pane => pane.pageId === p.id)).map(p => <option key={p.id} value={p.id}>{titleOf(p)}</option>)}</optgroup><optgroup label="Notes">{notes.state.notes.filter(n => !panes.some(p => p.pageId === `note:${n.id}`)).map(n => <option key={n.id} value={`note:${n.id}`}>{n.title || '未命名筆記'}</option>)}</optgroup><optgroup label="學程">{programs.filter(p => !panes.some(pane => pane.pageId === `school:${p.id}`)).map(p => <option key={p.id} value={`school:${p.id}`}>{p.university} · {p.programName}</option>)}</optgroup></select></label><span className="wb-split-hint" title="拖曳分頁到內容左右側以並排">{panes.length}/4 欄</span><span>Fall 2027</span><ChevronRight size={12} /><button onClick={() => visit(tab)}>{pageTitle}</button>{selectedProgram && <><ChevronRight size={12} /><span>{selectedProgram.university}</span></>}</div>
        <main ref={mainRef} id="workspace-content" className="wb-pane-area" aria-label="主要內容"><WorkspacePanes pages={pages} panes={panes} activeId={activeId} title={titleOf} draggingId={draggingId} onActivate={onActivate} onClose={close} onSplit={onSplit} onResize={onResize}>{children}</WorkspacePanes></main>
      </div>
    </div>
    <footer className="wb-statusbar"><span><span className={`wb-dot ${saveError ? 'error' : ''}`} />{saveError ? '儲存失敗，請先備份' : '申請工作區'}</span><span>{programs.length} 個學程</span><span>{editCount} 項資料修改</span><span className="wb-status-right"><Check size={12} />{saveError ? '需要處理' : '本機副本已保存'}<span>Fall 2027</span></span></footer>
  </div>
}
