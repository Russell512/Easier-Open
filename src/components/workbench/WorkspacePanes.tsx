import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { EllipsisVertical, X } from 'lucide-react'
import { workspacePage, type WorkspacePage, type WorkspacePane } from '../../lib/workspaceTabs'

import { dragPage, PAGE_DRAG_TYPE } from '../../lib/pageDrag'
function Pane({ page, pane, index, active, title, dragging, allowSplit, onActivate, onClose, onSplit, children }: {
  page: WorkspacePage; pane?: WorkspacePane; index: number; active: boolean; title: string; dragging: boolean; allowSplit: boolean;
  onActivate: (id: string) => void; onClose: (id: string) => void; onSplit: (page: WorkspacePage, target: string, side: 'left' | 'right') => void; children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const scroll = useRef(0)
  const [over, setOver] = useState('')
  const visible = !!pane
  useLayoutEffect(() => { if (visible && ref.current) ref.current.scrollTop = scroll.current }, [visible])
  return <section className={`wb-pane ${active ? 'focused' : ''}`} hidden={!pane} style={{ order: index * 2, flexGrow: pane?.size ?? 0 }} aria-label={`工作欄：${title}`} onPointerDownCapture={() => { if (!active) onActivate(page.id) }} onFocusCapture={() => { if (!active) onActivate(page.id) }}>
    <header className="wb-pane-heading"><span draggable onDragStart={event => dragPage(event, page)} title="拖曳到另一欄左右兩側以並排">{title}</span><button className="wb-icon-button" onClick={() => onClose(page.id)} aria-label={`關閉工作欄：${title}`} title="關閉此欄"><X size={15} /></button></header>
    <div ref={ref} role="tabpanel" id={`workspace-panel-${encodeURIComponent(page.id)}`} aria-labelledby={`workspace-tab-${encodeURIComponent(page.id)}`} className="wb-main" tabIndex={0} onScroll={event => { if (pane) scroll.current = event.currentTarget.scrollTop }}><div className="wb-content">{children}</div></div>
    {dragging && <div className="wb-drop-targets">{(['left', 'right'] as const).map(side => <div key={side} className={`wb-drop-target ${over === side ? 'over' : ''}`} onDragOver={event => { if (event.dataTransfer.types.includes(PAGE_DRAG_TYPE)) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setOver(side) } }} onDragLeave={() => setOver('')} onDrop={event => {
      event.preventDefault(); setOver('')
      try { const p = JSON.parse(event.dataTransfer.getData(PAGE_DRAG_TYPE)); if (typeof p.tab === 'string' && (p.school === null || typeof p.school === 'string') && (!p.noteId || typeof p.noteId === 'string')) onSplit(workspacePage(p.tab, p.school, p.noteId), page.id, side) } catch { /* Ignore unrelated drags. */ }
    }}>{allowSplit ? (side === 'left' ? '放到左側並排' : '放到右側並排') : '最多四欄 · 可拖曳已顯示分頁來換位'}</div>)}</div>}
  </section>
}
function Divider({ index, panes, onResize }: { index: number; panes: WorkspacePane[]; onResize: (index: number, size: number) => void }) {
  const start = useRef<{ x: number; size: number; width: number } | null>(null)
  const total = panes[index]!.size + panes[index + 1]!.size
  return <div className="wb-pane-divider" role="separator" aria-label={`調整第 ${index + 1} 與 ${index + 2} 欄寬度`} aria-orientation="vertical" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(panes[index]!.size / total * 100)} tabIndex={0} style={{ order: index * 2 + 1 }} onPointerDown={event => {
    if (event.button !== 0) return
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId)
    start.current = { x: event.clientX, size: panes[index]!.size, width: event.currentTarget.parentElement!.clientWidth - (panes.length - 1) * 12 }
  }} onPointerMove={event => { if (start.current) onResize(index, start.current.size + (event.clientX - start.current.x) / start.current.width) }} onPointerUp={event => { start.current = null; event.currentTarget.releasePointerCapture(event.pointerId) }} onPointerCancel={() => { start.current = null }} onLostPointerCapture={() => { start.current = null }} onDoubleClick={() => onResize(index, total / 2)} onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) { event.preventDefault(); onResize(index, event.key === 'Home' ? total / 2 : panes[index]!.size + (event.key === 'ArrowLeft' ? -0.025 : 0.025)) } }} title="拖曳調整寬度 · 雙擊平分 · 方向鍵微調"><EllipsisVertical size={18} /></div>
}
export function WorkspacePanes({ pages, panes, activeId, title, dragging, onActivate, onClose, onSplit, onResize, children }: {
  pages: WorkspacePage[]; panes: WorkspacePane[]; activeId: string; title: (page: WorkspacePage) => string; dragging: boolean;
  onActivate: (id: string) => void; onClose: (id: string) => void; onSplit: (page: WorkspacePage, target: string, side: 'left' | 'right') => void; onResize: (index: number, size: number) => void; children: (page: WorkspacePage) => ReactNode
}) {
  return <div className="wb-pane-strip" style={{ minWidth: panes.length > 1 ? panes.length * 300 : undefined }}>
    {pages.map(page => <Pane key={page.id} page={page} pane={panes.find(p => p.pageId === page.id)} index={panes.findIndex(p => p.pageId === page.id)} active={activeId === page.id} title={title(page)} dragging={dragging} allowSplit={panes.length < 4} onActivate={onActivate} onClose={onClose} onSplit={onSplit}>{children(page)}</Pane>)}
    {panes.slice(0, -1).map((p, index) => <Divider key={p.pageId} index={index} panes={panes} onResize={onResize} />)}
  </div>
}
