import { useMemo, useState } from 'react'
import {
  Check,
  CheckCircle2,
  Circle,
  ListChecks,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import type { ApplicationNote } from '../lib/notes'
import type { ApplicationNotesController } from '../hooks/useApplicationNotes'

function noteTitle(note: ApplicationNote) {
  return note.title.trim() || '未命名筆記'
}

function noteSnippet(note: ApplicationNote) {
  const body = note.body.trim().replace(/\s+/g, ' ')
  if (body) return body
  const checklistText = note.checklist.find((item) => item.text.trim())?.text.trim()
  return checklistText || '尚未加入內容'
}

function noteTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const today = new Date()
  if (date.toDateString() === today.toDateString()) {
    return new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit' }).format(date)
  }
  return new Intl.DateTimeFormat('zh-TW', { month: 'numeric', day: 'numeric' }).format(date)
}

function saveStatus(notes: ApplicationNotesController) {
  if (notes.saveError) return notes.saveError
  if (notes.saving) return '正在自動儲存…'
  if (!notes.lastSaved) return '內容會自動儲存'
  return `已儲存 ${noteTime(notes.lastSaved)}`
}

export function NoteEditor({ notes, noteId }: { notes: ApplicationNotesController; noteId: string }) {
  const selected = notes.state.notes.find(note => note.id === noteId)
  if (!selected) return <p className="wb-muted">這篇筆記已刪除。</p>
  function deleteSelected() {
    if (selected && window.confirm(`確定要刪除「${noteTitle(selected)}」嗎？這個動作無法復原。`)) notes.deleteNote(selected.id)
  }
  return <div className="wb-note-editor wb-legacy">            <div className="flex h-full min-h-[680px] flex-col">
              <header className="flex items-center gap-3 border-b border-stone-100 px-5 py-4 sm:px-7">
                <input
                  value={selected.title}
                  onChange={(event) => notes.updateNote(selected.id, { title: event.target.value })}
                  placeholder="未命名筆記"
                  aria-label="Note 標題"
                  className="min-w-0 flex-1 bg-transparent text-xl font-bold tracking-tight text-stone-900 outline-none placeholder:text-stone-300 sm:text-2xl"
                />
                <button
                  onClick={deleteSelected}
                  className="rounded-xl border border-stone-200 p-2 text-stone-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                  aria-label="刪除這篇 Note"
                  title="刪除 Note"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </header>

              <div className="flex-1 p-5 sm:p-7">
                <textarea
                  value={selected.body}
                  onChange={(event) => notes.updateNote(selected.id, { body: event.target.value })}
                  placeholder="開始寫下你看到的資訊、比較結果或想法…"
                  aria-label="Note 內容"
                  className="min-h-72 w-full resize-y border-0 bg-transparent text-sm leading-7 text-stone-800 outline-none placeholder:text-stone-300 sm:text-[15px]"
                  data-testid="note-body-editor"
                />

                <section className="mt-6 border-t border-stone-100 pt-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="flex items-center gap-2 text-sm font-bold text-stone-800"><ListChecks className="h-4 w-4 text-emerald-700" />Checklist</h2>
                      <p className="mt-1 text-[11px] text-stone-400">加入可直接打勾的行動項目。</p>
                    </div>
                    <button
                      onClick={() => notes.addChecklistItem(selected.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-[11px] font-bold text-stone-600 hover:border-emerald-300 hover:text-emerald-700"
                      data-testid="add-checklist-item"
                    >
                      <Plus className="h-3.5 w-3.5" />新增項目
                    </button>
                  </div>

                  <div className="mt-4 space-y-2">
                    {selected.checklist.map((item) => (
                      <div key={item.id} className="group flex items-center gap-2 rounded-xl border border-stone-100 bg-stone-50/70 p-2.5">
                        <button
                          onClick={() => notes.updateChecklistItem(selected.id, item.id, { checked: !item.checked })}
                          className={`shrink-0 rounded-full ${item.checked ? 'text-emerald-600' : 'text-stone-300 hover:text-emerald-500'}`}
                          aria-label={item.checked ? '標示為未完成' : '標示為已完成'}
                        >
                          {item.checked ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                        </button>
                        <input
                          value={item.text}
                          onChange={(event) => notes.updateChecklistItem(selected.id, item.id, { text: event.target.value })}
                          placeholder="要完成的事項…"
                          aria-label="Checklist 項目"
                          className={`min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-stone-300 ${item.checked ? 'text-stone-400 line-through' : 'text-stone-700'}`}
                        />
                        <button
                          onClick={() => notes.deleteChecklistItem(selected.id, item.id)}
                          className="rounded-lg p-1.5 text-stone-300 opacity-0 hover:bg-rose-50 hover:text-rose-500 group-hover:opacity-100 focus:opacity-100"
                          aria-label="刪除 Checklist 項目"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {!selected.checklist.length && (
                      <button
                        onClick={() => notes.addChecklistItem(selected.id)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-stone-200 py-5 text-xs font-semibold text-stone-400 hover:border-emerald-300 hover:text-emerald-700"
                      >
                        <Plus className="h-4 w-4" />加入第一個 Checklist 項目
                      </button>
                    )}
                  </div>
                </section>
              </div>

              <footer className="flex items-center justify-between border-t border-stone-100 px-5 py-3 text-[10px] text-stone-400 sm:px-7">
                <span>{selected.body.length.toLocaleString('zh-TW')} characters · {selected.checklist.length} checklist items</span>
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><Check className="h-3 w-3" />{saveStatus(notes)}</span>
              </footer>
            </div></div>
}

export function NotesList({ notes, onOpen, compact = false, onDragNote }: { notes: ApplicationNotesController; onOpen: (id: string) => void; compact?: boolean; onDragNote?: (id: string) => void }) {
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => [...notes.state.notes].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).filter(note => `${note.title} ${note.body} ${note.checklist.map(item => item.text).join(' ')}`.toLowerCase().includes(search.toLowerCase())), [notes.state.notes, search])
  return <section className={`wb-notes-list ${compact ? 'compact' : ''}`} aria-label="Notes 清單">
    <header><div><h2>Notes</h2><span>{notes.state.notes.length} 篇筆記</span></div><button className="wb-icon-button" aria-label="新增 Note" title="新增 Note" onClick={() => onOpen(notes.createNote())}><Plus size={18} /></button></header>
    <label className="wb-sidebar-search"><Search size={14} /><input aria-label={compact ? '搜尋側欄 Notes' : '搜尋 Notes'} placeholder="搜尋筆記…" value={search} onChange={event => setSearch(event.target.value)} /></label>
    <div className="wb-notes-items">{filtered.map(note => <button key={note.id} draggable onDragStart={event => { event.dataTransfer.setData('application/x-easier-page', JSON.stringify({ tab: 'notes', school: null, noteId: note.id })); event.dataTransfer.effectAllowed = 'move'; onDragNote?.(note.id) }} onClick={() => onOpen(note.id)} className={notes.state.selectedNoteId === note.id ? 'active' : ''} data-testid="note-list-item" title="點選在右側開啟，或拖曳到工作區並排"><strong>{noteTitle(note)}</strong><span>{noteTime(note.updatedAt)} · {noteSnippet(note)}</span>{note.programId && <small>學程筆記</small>}</button>)}{!filtered.length && <p className="wb-sidebar-empty">{search ? '找不到筆記' : '記下想法、學程比較或待辦事項。'}</p>}</div>
  </section>
}
export function NotesPage({ notes, onOpen }: { notes: ApplicationNotesController; onOpen: (id: string) => void }) {
  return <section><h1 className="wb-notes-title">我的 Notes</h1><p className="wb-muted">選擇筆記，在右側編輯。可和學程一起並排查看，內容自動儲存。</p><NotesList notes={notes} onOpen={onOpen} /></section>
}
