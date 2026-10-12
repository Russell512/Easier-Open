import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, CheckCircle2, Circle, NotebookPen, Plus, X } from 'lucide-react'
import type { ApplicationNotesController } from '../hooks/useApplicationNotes'

function noteLabel(title: string) {
  return title.trim() || '未命名筆記'
}

export function GlobalNotes({
  notes,
  onOpenNotesPage,
  hidden = false,
}: {
  notes: ApplicationNotesController
  onOpenNotesPage: () => void
  hidden?: boolean
}) {
  const [open, setOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const selected = notes.selectedNote

  useEffect(() => {
    if (!open) return
    textareaRef.current?.focus()
  }, [open, selected?.id])

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [])

  if (hidden) return null

  return (
    <>
      {open && (
        <aside
          className="fixed inset-x-3 bottom-24 z-[65] flex max-h-[min(72vh,640px)] flex-col overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-2xl shadow-stone-950/20 sm:left-auto sm:right-6 sm:w-[420px]"
          role="dialog"
          aria-modal="false"
          aria-labelledby="global-notes-title"
          data-testid="global-notes-panel"
        >
          <header className="border-b border-stone-100 bg-[#173f35] px-4 py-4 text-white">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <NotebookPen className="h-4 w-4 text-lime-200" />
                <h2 id="global-notes-title" className="text-sm font-bold">Quick Notes</h2>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-bold text-emerald-100/70">{notes.state.notes.length}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={notes.createNote}
                  className="rounded-xl border border-white/10 bg-white/5 p-2 text-emerald-50 hover:bg-white/10"
                  aria-label="新增 Note"
                  title="新增 Note"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-white/10 bg-white/5 p-2 text-emerald-50 hover:bg-white/10"
                  aria-label="關閉筆記"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            {notes.state.notes.length > 0 && (
              <select
                value={notes.state.selectedNoteId}
                onChange={(event) => notes.selectNote(event.target.value)}
                aria-label="選擇要編輯的 Note"
                className="mt-3 h-10 w-full rounded-xl border border-white/10 bg-white/10 px-3 text-xs font-semibold text-white outline-none focus:border-lime-200 [&>option]:text-stone-900"
              >
                {notes.state.notes.map((note) => <option key={note.id} value={note.id}>{noteLabel(note.title)}</option>)}
              </select>
            )}
          </header>

          {selected ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <input
                value={selected.title}
                onChange={(event) => notes.updateNote(selected.id, { title: event.target.value })}
                placeholder="未命名筆記"
                aria-label="Note 標題"
                className="w-full border-0 bg-transparent px-1 text-base font-bold text-stone-900 outline-none placeholder:text-stone-300"
              />
              <textarea
                ref={textareaRef}
                value={selected.body}
                onChange={(event) => notes.updateNote(selected.id, { body: event.target.value })}
                placeholder="記下 program 資訊、比較結果或想法…"
                aria-label="Note 內容"
                className="mt-2 min-h-44 w-full resize-y rounded-2xl border border-stone-200 bg-stone-50 p-3.5 text-sm leading-6 text-stone-800 outline-none placeholder:text-stone-400 focus:border-emerald-400 focus:bg-white"
              />

              <div className="mt-3 space-y-1.5">
                {selected.checklist.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 rounded-xl bg-stone-50 px-2.5 py-2">
                    <button
                      onClick={() => notes.updateChecklistItem(selected.id, item.id, { checked: !item.checked })}
                      className={item.checked ? 'text-emerald-600' : 'text-stone-300 hover:text-emerald-500'}
                      aria-label={item.checked ? '標示為未完成' : '標示為已完成'}
                    >
                      {item.checked ? <CheckCircle2 className="h-4.5 w-4.5" /> : <Circle className="h-4.5 w-4.5" />}
                    </button>
                    <input
                      value={item.text}
                      onChange={(event) => notes.updateChecklistItem(selected.id, item.id, { text: event.target.value })}
                      placeholder="Checklist item…"
                      className={`min-w-0 flex-1 bg-transparent text-xs outline-none ${item.checked ? 'text-stone-400 line-through' : 'text-stone-700'}`}
                    />
                    <button onClick={() => notes.deleteChecklistItem(selected.id, item.id)} className="p-1 text-stone-300 hover:text-rose-500" aria-label="刪除 Checklist 項目"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
                <button
                  onClick={() => notes.addChecklistItem(selected.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50"
                >
                  <Plus className="h-3.5 w-3.5" />新增 Checklist
                </button>
              </div>
            </div>
          ) : (
            <div className="grid min-h-64 place-items-center p-6 text-center">
              <div>
                <NotebookPen className="mx-auto h-7 w-7 text-stone-300" />
                <p className="mt-3 text-xs font-semibold text-stone-500">目前沒有 Note</p>
                <button onClick={notes.createNote} className="mt-3 rounded-xl bg-[#173f35] px-3 py-2 text-[11px] font-bold text-white">新增 Note</button>
              </div>
            </div>
          )}

          <footer className="flex items-center justify-between gap-3 border-t border-stone-100 bg-stone-50/80 px-4 py-3">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700"><Check className="h-3 w-3" />{notes.saveError || (notes.saving ? '儲存中…' : '已自動儲存')}</span>
            <button
              onClick={() => {
                setOpen(false)
                onOpenNotesPage()
              }}
              className="inline-flex items-center gap-1.5 text-[10px] font-bold text-stone-600 hover:text-emerald-700"
            >
              打開完整 Notes 頁面<ArrowRight className="h-3 w-3" />
            </button>
          </footer>
        </aside>
      )}

      <button
        onClick={() => setOpen((value) => !value)}
        className="fixed bottom-5 right-5 z-[65] grid h-14 w-14 place-items-center rounded-full border border-white/20 bg-[#173f35] text-white shadow-xl shadow-emerald-950/25 transition hover:-translate-y-0.5 hover:bg-[#1d4b40] hover:shadow-2xl focus-visible:outline-white sm:bottom-6 sm:right-6"
        aria-label={open ? '關閉 Quick Notes' : '開啟 Quick Notes'}
        aria-expanded={open}
        title="Quick Notes"
        data-testid="global-notes-button"
      >
        {open ? <X className="h-5 w-5" /> : <NotebookPen className="h-5 w-5" />}
        {!open && notes.state.notes.some((note) => note.body.trim() || note.checklist.some((item) => item.text.trim())) && <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#173f35] bg-lime-300" aria-hidden="true" />}
      </button>
    </>
  )
}
