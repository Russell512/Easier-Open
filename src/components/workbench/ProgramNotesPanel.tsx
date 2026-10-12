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
          placeholder="記下研究心得、喜歡或在意的地方、待確認的問題…"
          onChange={(event) => notes.updateProgramNote(program.id, `${program.university} · ${program.programName}`, event.target.value)}
        />
      </label>
      {notes.saveError ? <div role="alert" className="wb-note-error">{notes.saveError}<button className="wb-text-button" onClick={notes.retrySave}>重試儲存</button></div> : <p className="wb-input-hint" role="status">{notes.saving ? '正在儲存…' : note ? '已儲存至本機' : '輸入後自動儲存'} · 雲端同步進度見上方狀態列</p>}
      <p className="wb-input-hint">此筆記專屬於這個學程，也可從「筆記與待辦」集中查看。</p>
    </div>
  </Panel>
}
