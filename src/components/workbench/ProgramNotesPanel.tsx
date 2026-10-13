import { NotebookPen } from 'lucide-react'
import type { ApplicationNotesController } from '../../hooks/useApplicationNotes'
import type { ProgramView } from '../../types'
import { Panel } from './shared'

export function ProgramNotesPanel({ program, notes }: { program: ProgramView; notes: ApplicationNotesController }) {
  const note = notes.state.notes.find((item) => item.programId === program.id)
  return <Panel title="我的筆記" icon={<NotebookPen size={17} />} className="wb-program-notes">
    <div className="wb-panel-body">
      <label className="wb-field-label">
        {program.programName} · 個人紀錄
        <textarea
          aria-label="這個學程的筆記"
          rows={4}
          value={note?.body ?? ''}
          placeholder="寫下筆記…"
          onChange={(event) => notes.updateProgramNote(program.id, `${program.university} · ${program.programName}`, event.target.value)}
        />
      </label>
      {notes.saveError ? <div role="alert" className="wb-note-error">{notes.saveError}<button className="wb-text-button" onClick={notes.retrySave}>重試儲存</button></div> : (notes.saving || note) && <p className="wb-input-hint" role="status">{notes.saving ? '儲存中…' : '已儲存'}</p>}
    </div>
  </Panel>
}
