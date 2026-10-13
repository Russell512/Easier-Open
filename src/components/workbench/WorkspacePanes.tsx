import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Columns2, EllipsisVertical, X } from 'lucide-react'
import { type WorkspacePage, type WorkspacePane } from '../../lib/workspaceTabs'

import { dragPage, PAGE_DRAG_TYPE, readDraggedPage } from '../../lib/pageDrag'
function Pane({ page, pane, index, active, title, draggingId, allowSplit, onActivate, onClose, onSplit, children }: {
  page: WorkspacePage; pane?: WorkspacePane; index: number; active: boolean; title: string; draggingId: string | null; allowSplit: boolean;
  onActivate: (id: string) => void; onClose: (id: string) => void; onSplit: (page: WorkspacePage, target: string, side: 'left' | 'right') => void; children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const scroll = useRef(0)
  const visible = !!pane
  useLayoutEffect(() => { if (visible && ref.current) ref.current.scrollTop = scroll.current }, [visible])
  return <section className={`wb-pane ${active ? 'focused' : ''}`} hidden={!pane} style={{ order: index * 2, flexGrow: pane?.size ?? 0 }} aria-label={`工作欄：${title}`} onPointerDownCapture={() => { if (!active) onActivate(page.id) }} onFocusCapture={() => { if (!active) onActivate(page.id) }}>
    <header className="wb-pane-heading"><span draggable onDragStart={event => dragPage(event, page, title)} title="拖曳到另一欄左右兩側以並排">{title}</span><button className="wb-icon-button" onClick={() => onClose(page.id)} aria-label={`關閉工作欄：${title}`} title="關閉此欄"><X size={15} /></button></header>
    <div ref={ref} role="tabpanel" id={`workspace-panel-${encodeURIComponent(page.id)}`} aria-labelledby={`workspace-tab-${encodeURIComponent(page.id)}`} className="wb-main" tabIndex={0} onScroll={event => { if (pane) scroll.current = event.currentTarget.scrollTop }}><div className="wb-content">{children}</div></div>
    {draggingId && <DropGuide allowed={allowSplit && draggingId !== page.id} self={draggingId === page.id} onSplit={(dropped, side) => onSplit(dropped, page.id, side)} /> }
  </section>
}
function DropGuide({ allowed, self, onSplit }: { allowed: boolean; self: boolean; onSplit: (page: WorkspacePage, side: 'left' | 'right') => void }) {
  const [side, setSide] = useState<'left' | 'right' | null>(null)
  return <div className="wb-drop-targets" onDragOver={event => {
    if (!event.dataTransfer.types.includes(PAGE_DRAG_TYPE)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = allowed ? 'move' : 'none'
    const bounds = event.currentTarget.getBoundingClientRect()
    setSide(event.clientX < bounds.left + bounds.width / 2 ? 'left' : 'right')
  }} onDragLeave={() => setSide(null)} onDrop={event => {
    event.preventDefault()
    const page = readDraggedPage(event.dataTransfer)
    if (allowed && page && side) onSplit(page, side)
    setSide(null)
  }}>
    <div aria-hidden="true" className={`wb-drop-preview ${allowed && side ? 'visible' : ''}`} data-side={side ?? 'left'}><span><Columns2 size={15} />{side === 'right' ? '放開，在右側並排' : '放開，在左側並排'}</span></div>
    {!allowed && !self && side && <span className="wb-drop-limit">已開啟四欄，請先關閉一欄</span>}
  </div>
}
function Divider({ index, panes, onResize, onResizing }: { index: number; panes: WorkspacePane[]; onResize: (index: number, size: number) => void; onResizing: (value: boolean) => void }) {
  const start = useRef<{ x: number; size: number; width: number } | null>(null)
  const total = panes[index]!.size + panes[index + 1]!.size
  return <div className="wb-pane-divider" role="separator" aria-label={`調整第 ${index + 1} 與 ${index + 2} 欄寬度`} aria-orientation="vertical" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(panes[index]!.size / total * 100)} tabIndex={0} style={{ order: index * 2 + 1 }} onPointerDown={event => {
    if (event.button !== 0) return
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); onResizing(true)
    start.current = { x: event.clientX, size: panes[index]!.size, width: event.currentTarget.parentElement!.clientWidth - (panes.length - 1) * 12 }
  }} onPointerMove={event => { if (start.current) onResize(index, start.current.size + (event.clientX - start.current.x) / start.current.width) }} onPointerUp={event => { start.current = null; onResizing(false); event.currentTarget.releasePointerCapture(event.pointerId) }} onPointerCancel={() => { start.current = null; onResizing(false) }} onLostPointerCapture={() => { start.current = null; onResizing(false) }} onDoubleClick={() => onResize(index, total / 2)} onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) { event.preventDefault(); onResize(index, event.key === 'Home' ? total / 2 : panes[index]!.size + (event.key === 'ArrowLeft' ? -0.025 : 0.025)) } }} title="拖曳調整寬度 · 雙擊平分 · 方向鍵微調"><EllipsisVertical size={18} /></div>
}
export function WorkspacePanes({ pages, panes, activeId, title, draggingId, onActivate, onClose, onSplit, onResize, children }: {
  pages: WorkspacePage[]; panes: WorkspacePane[]; activeId: string; title: (page: WorkspacePage) => string; draggingId: string | null;
  onActivate: (id: string) => void; onClose: (id: string) => void; onSplit: (page: WorkspacePage, target: string, side: 'left' | 'right') => void; onResize: (index: number, size: number) => void; children: (page: WorkspacePage) => ReactNode
}) {
  const [resizing, setResizing] = useState(false)
  return <div className={`wb-pane-strip ${resizing ? 'is-resizing' : ''}`} style={{ minWidth: panes.length > 1 ? panes.length * 300 : undefined }}>
    {pages.map(page => <Pane key={page.id} page={page} pane={panes.find(p => p.pageId === page.id)} index={panes.findIndex(p => p.pageId === page.id)} active={activeId === page.id} title={title(page)} draggingId={draggingId} allowSplit={panes.length < 4 || panes.some(p => p.pageId === draggingId)} onActivate={onActivate} onClose={onClose} onSplit={onSplit}>{children(page)}</Pane>)}
    {panes.slice(0, -1).map((p, index) => <Divider key={p.pageId} index={index} panes={panes} onResize={onResize} onResizing={setResizing} />)}
  </div>
}
