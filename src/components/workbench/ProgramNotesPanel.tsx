import { NotebookPen } from 'lucide-react'
import type { ApplicationNotesController } from '../../hooks/useApplicationNotes'
import type { ProgramView } from '../../types'
import { Panel } from './shared'
import { MarkdownNoteEditor } from '../MarkdownNoteEditor'

export function ProgramNotesPanel({ program, notes }: { program: ProgramView; notes: ApplicationNotesController }) {
  const note = notes.state.notes.find((item) => item.programId === program.id)
  return <Panel title="我的筆記" icon={<NotebookPen size={17} />} className="wb-program-notes">
    <div className="wb-panel-body">
      <p className="wb-field-label">{program.programName} · 個人紀錄</p>
        <MarkdownNoteEditor
          key={program.id}
          compact
          label="這個學程的筆記"
          title={note?.title ?? `${program.university} · ${program.programName}`}
          checklist={note?.checklist}
          value={note?.body ?? ''}
          onChange={(body) => notes.updateProgramNote(program.id, `${program.university} · ${program.programName}`, body)}
        />
      {notes.saveError ? <div role="alert" className="wb-note-error">{notes.saveError}<button className="wb-text-button" onClick={notes.retrySave}>重試儲存</button></div> : (notes.saving || note) && <p className="wb-input-hint" role="status">{notes.saving ? '儲存中…' : '已儲存'}</p>}
    </div>
  </Panel>
}
