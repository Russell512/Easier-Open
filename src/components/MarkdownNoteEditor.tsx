import { lazy, Suspense } from 'react'
import type { NoteChecklistItem } from '../lib/notes'
import './markdownNotes.css'

export interface MarkdownNoteEditorProps {
  value: string
  onChange: (value: string) => void
  title: string
  checklist?: NoteChecklistItem[]
  label?: string
  placeholder?: string
  compact?: boolean
  autoFocus?: boolean
}

// Load the editing engine only when a note is opened, not on the dashboard.
const Editor = lazy(() => import('./MarkdownNoteEditorImpl'))

export function MarkdownNoteEditor(props: MarkdownNoteEditorProps) {
  return <Suspense fallback={<div className="md-note-loading" role="status">正在載入筆記編輯器…</div>}>
    <Editor {...props} />
  </Suspense>
}
