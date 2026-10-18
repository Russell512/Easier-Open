import { memo, useCallback, useDeferredValue, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Annotation, EditorState, Transaction } from '@codemirror/state'
import { EditorView, drawSelection, keymap, placeholder as editorPlaceholder } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { Bold, Check, Columns2, Copy, Eye, Heading2, Highlighter, Italic, Link, List, Pencil, Quote, X } from 'lucide-react'
import { formatNoteSelection, normalizeNoteUrl, noteLinkEdit, noteToMarkdown, type MarkdownEdit, type NoteFormat } from '../lib/noteMarkdown'
import { renderNoteMarkdown } from '../lib/renderNoteMarkdown'
import type { MarkdownNoteEditorProps } from './MarkdownNoteEditor'

const externalChange = Annotation.define<boolean>()
const highlightStyle = HighlightStyle.define([
  { tag: tags.strong, fontWeight: '750', color: 'var(--md-text)' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.heading, fontWeight: '700', color: 'var(--md-accent)' },
  { tag: [tags.link, tags.url], color: 'var(--md-accent)', textDecoration: 'underline' },
  { tag: [tags.processingInstruction, tags.meta], color: 'var(--md-muted)' },
  { tag: tags.monospace, color: 'var(--md-code)' },
])

const NotePreview = memo(function NotePreview({ value }: { value: string }) {
  const html = useMemo(() => renderNoteMarkdown(value), [value])
  return <div className="md-note-preview" aria-label="筆記預覽">
    {value.trim() ? <div className="md-note-prose" dangerouslySetInnerHTML={{ __html: html }} /> : <p className="md-note-empty">格式會即時顯示在這裡。</p>}
  </div>
})

const formats = [
  { action: 'bold', label: '粗體', hint: '⌘ / Ctrl + B', Icon: Bold },
  { action: 'italic', label: '斜體', hint: '⌘ / Ctrl + I', Icon: Italic },
  { action: 'highlight', label: '螢光標記', hint: '', Icon: Highlighter },
  { action: 'heading', label: '小標題', hint: '', Icon: Heading2 },
  { action: 'list', label: '項目清單', hint: '', Icon: List },
  { action: 'quote', label: '引用', hint: '', Icon: Quote },
] as const

export default function MarkdownNoteEditorImpl(props: MarkdownNoteEditorProps) {
  const { value, onChange, title, checklist = [], label = 'Note 內容', placeholder = '寫下筆記…', compact = false, autoFocus = false } = props
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const latest = useRef({ value, onChange })
  const [mode, setMode] = useState<'edit' | 'split' | 'preview'>(compact ? 'edit' : 'split')
  const [link, setLink] = useState<{ text: string; url: string } | null>(null)
  const wasLinkOpen = useRef(false)
  const [linkError, setLinkError] = useState('')
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle')
  const [manualCopy, setManualCopy] = useState('')
  const deferredValue = useDeferredValue(value)
  const linkId = useId()

  useLayoutEffect(() => { latest.current = { value, onChange } }, [value, onChange])

  const applyEdit = useCallback((edit: MarkdownEdit) => {
    const editor = view.current
    if (!editor) return
    editor.dispatch({
      changes: { from: edit.from, to: edit.to, insert: edit.insert },
      selection: { anchor: edit.anchor, head: edit.head },
      scrollIntoView: true,
      userEvent: 'input.format',
    })
    editor.focus()
  }, [])

  const format = useCallback((action: NoteFormat) => {
    const editor = view.current
    if (!editor) return
    const { from, to } = editor.state.selection.main
    applyEdit(formatNoteSelection(editor.state.doc.toString(), from, to, action))
  }, [applyEdit])

  const openLink = useCallback(() => {
    const editor = view.current
    if (!editor) return
    const { from, to } = editor.state.selection.main
    const text = editor.state.sliceDoc(from, to)
    setLink({ text, url: /^(https?:\/\/|mailto:)/i.test(text) ? text : '' })
    setLinkError('')
  }, [])

  useEffect(() => {
    // Restore typing focus after React has removed the form and the inert attribute.
    if (!link && wasLinkOpen.current) view.current?.focus()
    wasLinkOpen.current = !!link
  }, [link])

  useEffect(() => {
    if (!host.current) return
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: latest.current.value,
        extensions: [
          history(), drawSelection(), markdown(), syntaxHighlighting(highlightStyle), EditorView.lineWrapping,
          editorPlaceholder(placeholder),
          EditorView.contentAttributes.of({ 'aria-label': label, 'aria-multiline': 'true', 'data-testid': 'note-body-editor', spellcheck: 'true' }),
          keymap.of([
            { key: 'Mod-b', run: () => { format('bold'); return true } },
            { key: 'Mod-i', run: () => { format('italic'); return true } },
            { key: 'Mod-k', run: () => { openLink(); return true }, stopPropagation: true },
            ...defaultKeymap, ...historyKeymap, indentWithTab,
          ]),
          EditorView.updateListener.of(update => {
            if (update.docChanged && !update.transactions.some(transaction => transaction.annotation(externalChange))) {
              latest.current.onChange(update.state.doc.toString())
            }
          }),
        ],
      }),
    })
    view.current = editor
    if (autoFocus) editor.focus()
    return () => { editor.destroy(); view.current = null }
  }, [label, placeholder, autoFocus, format, openLink])

  useEffect(() => {
    const editor = view.current
    if (!editor) return
    const previous = editor.state.doc.toString()
    if (previous === value) return
    // Sync edits from another workspace pane without resetting the caret or undo history.
    let from = 0
    while (from < previous.length && from < value.length && previous[from] === value[from]) from++
    let oldEnd = previous.length
    let newEnd = value.length
    while (oldEnd > from && newEnd > from && previous[oldEnd - 1] === value[newEnd - 1]) { oldEnd--; newEnd-- }
    editor.dispatch({ changes: { from, to: oldEnd, insert: value.slice(from, newEnd) }, annotations: [externalChange.of(true), Transaction.addToHistory.of(false)] })
  }, [value])

  useEffect(() => {
    if (copyStatus !== 'copied') return
    const timer = window.setTimeout(() => setCopyStatus('idle'), 2200)
    return () => window.clearTimeout(timer)
  }, [copyStatus])

  function closeLink() {
    setLink(null)
    setLinkError('')
  }

  async function copyMarkdown() {
    const text = noteToMarkdown({ title, body: view.current?.state.doc.toString() ?? value, checklist })
    setCopyStatus('copying')
    setManualCopy('')
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(text)
      setCopyStatus('copied')
    } catch {
      // A selectable copy remains available when clipboard permission is denied.
      setManualCopy(text)
      setCopyStatus('error')
    }
  }

  return <section className={`md-note ${compact ? 'md-note-compact' : ''}`} aria-label="Markdown 筆記編輯器">
    <div className="md-note-toolbar">
      <div className="md-note-formats" role="group" aria-label="文字格式">
        {formats.map(({ action, label: name, hint, Icon }, index) => <span key={action} className={index === 3 ? 'md-note-tool-divider' : undefined}>
          <button type="button" aria-label={name} title={`${name}${hint ? ` (${hint})` : ''}`} disabled={mode === 'preview' || !!link} onMouseDown={event => event.preventDefault()} onClick={() => format(action)}><Icon size={16} /></button>
          {index === 2 && <button type="button" aria-label="插入超連結" title="插入超連結 (⌘ / Ctrl + K)" disabled={mode === 'preview' || !!link} onMouseDown={event => event.preventDefault()} onClick={openLink}><Link size={16} /></button>}
        </span>)}
      </div>
      <button type="button" className="md-note-copy" onClick={() => void copyMarkdown()} disabled={copyStatus === 'copying'} title="複製這篇筆記的標題、內容與 Checklist">
        {copyStatus === 'copied' ? <Check size={14} /> : <Copy size={14} />}{copyStatus === 'copied' ? '已複製' : copyStatus === 'copying' ? '複製中…' : '複製 Markdown'}
      </button>
    </div>

    {link && <form className="md-note-link-form" aria-label="插入超連結" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); closeLink() } }} onSubmit={event => {
      event.preventDefault()
      const url = normalizeNoteUrl(link.url)
      if (!url) { setLinkError('請輸入有效的 http、https 或 mailto 連結。'); return }
      const selection = view.current?.state.selection.main
      if (!selection) return
      applyEdit(noteLinkEdit(selection.from, selection.to, link.text, url))
      setLink(null)
    }}>
      <label htmlFor={`${linkId}-text`}>顯示文字<input id={`${linkId}-text`} value={link.text} placeholder="連結名稱" onChange={event => setLink({ ...link, text: event.target.value })} /></label>
      <label htmlFor={`${linkId}-url`}>連結網址<input id={`${linkId}-url`} autoFocus inputMode="url" value={link.url} placeholder="https://example.com" aria-invalid={!!linkError} aria-describedby={linkError ? `${linkId}-error` : undefined} onChange={event => { setLink({ ...link, url: event.target.value }); setLinkError('') }} /></label>
      <div className="md-note-link-actions"><button type="submit" className="md-note-insert">插入連結</button><button type="button" aria-label="取消插入連結" onClick={closeLink}><X size={16} /></button></div>
      {linkError && <p id={`${linkId}-error`} className="md-note-error" role="alert">{linkError}</p>}
    </form>}

    <div className="md-note-modebar">
      <span>選取文字，再按上方工具套用格式</span>
      <div className="md-note-modes" role="group" aria-label="編輯顯示方式">
        {([{ id: 'edit', label: '編輯', Icon: Pencil }, { id: 'split', label: '並排', Icon: Columns2 }, { id: 'preview', label: '預覽', Icon: Eye }] as const).map(item => <button key={item.id} type="button" aria-pressed={mode === item.id} disabled={!!link} onClick={() => setMode(item.id)}><item.Icon size={12} />{item.label}</button>)}
      </div>
    </div>
    <div className={`md-note-panes md-note-${mode}`}>
      <div className="md-note-source" hidden={mode === 'preview'} ref={host} inert={!!link} />
      {mode !== 'edit' && <NotePreview value={deferredValue} />}
    </div>
    <span className="md-note-sr-status" role="status">{copyStatus === 'copied' ? '已複製完整筆記 Markdown，包含標題與 Checklist。' : ''}</span>
    {manualCopy && <div className="md-note-manual-copy"><p role="alert">瀏覽器未允許自動複製，請選取下方內容後按 ⌘ / Ctrl + C。</p><textarea autoFocus aria-label="手動複製完整 Markdown" readOnly value={manualCopy} onFocus={event => event.target.select()} /><button type="button" onClick={() => { setManualCopy(''); setCopyStatus('idle') }}>關閉</button></div>}
  </section>
}
