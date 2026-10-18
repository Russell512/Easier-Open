import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, Copy, Download, FileSpreadsheet, GraduationCap, LoaderCircle, Plus, Upload, X } from 'lucide-react'
import type { CellValue, WorkbookModel } from '../../types'
import { toDateInput } from '../../lib/workbook'
import {
  createProgramsImportCsv,
  createProgramTemplateCsv,
  previewManualProgram,
  previewProgramsCsv,
  PROGRAM_IMPORT_FIELDS,
  PROGRAM_IMPORT_LIMITS,
  PROGRAM_IMPORT_PROMPT,
  type ProgramImportPreview,
} from '../../lib/programImport'
import './addPrograms.css'

type AddMode = 'manual' | 'csv'
const PAGE_SIZE = 25
const PRIMARY_FIELDS = new Set(['University', 'Program Name', 'Degree', 'Campus'])

function downloadText(text: string, fileName: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function failedPreview(message: string): ProgramImportPreview {
  return { rows: [], errors: [message], warnings: [], readyCount: 0, duplicateCount: 0, invalidCount: 0 }
}

export function AddProgramsDialog({ model, onAdd, onClose }: {
  model: WorkbookModel
  onAdd: (preview: ProgramImportPreview) => Promise<void>
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const firstField = useRef<HTMLInputElement>(null)
  const manualTab = useRef<HTMLButtonElement>(null)
  const csvTab = useRef<HTMLButtonElement>(null)
  const readVersion = useRef(0)
  const committing = useRef(false)
  const [mode, setMode] = useState<AddMode>('manual')
  const [values, setValues] = useState<Record<string, string>>({})
  const [reviewManual, setReviewManual] = useState(false)
  const [csvText, setCsvText] = useState<string | null>(null)
  const [csvDraft, setCsvDraft] = useState('')
  const [fileName, setFileName] = useState('')
  const [reading, setReading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showPrompt, setShowPrompt] = useState(false)
  const [previewPage, setPreviewPage] = useState(0)

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const element = dialog.current
    element?.showModal()
    firstField.current?.focus()
    return () => {
      readVersion.current += 1
      element?.close()
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  const preview = useMemo(() => {
    try {
      if (mode === 'manual') return reviewManual ? previewManualProgram(values, model) : null
      return csvText === null ? null : previewProgramsCsv(csvText, model)
    } catch {
      return failedPreview('無法讀取這份資料，請確認內容後重試。CSV 請使用下載的範本並另存為 UTF-8。')
    }
  }, [mode, reviewManual, values, csvText, model])
  const canAdd = !!preview && preview.readyCount > 0 && preview.invalidCount === 0 && preview.errors.length === 0
  const locked = busy || reading

  useEffect(() => {
    if (!preview) return
    const heading = dialog.current?.querySelector<HTMLElement>('#add-preview-title')
    heading?.focus({ preventScroll: true })
    heading?.scrollIntoView({ block: 'nearest' })
  }, [preview])

  function changeMode(next: AddMode) {
    if (locked) return
    setMode(next)
    setError('')
    setNotice('')
    setPreviewPage(0)
  }

  function tabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || locked) return
    event.preventDefault()
    const next = event.key === 'Home' ? 'manual' : event.key === 'End' ? 'csv' : mode === 'manual' ? 'csv' : 'manual'
    changeMode(next)
    ;(next === 'manual' ? manualTab : csvTab).current?.focus()
  }

  function updateField(key: string, value: string) {
    setValues(current => ({ ...current, [key]: value }))
    setReviewManual(false)
    setError('')
    setNotice('')
  }

  function reviewForm(event: FormEvent) {
    event.preventDefault()
    if (locked) return
    setReviewManual(true)
    setError('')
  }

  async function readCsv(file: File | undefined) {
    if (!file || committing.current) return
    const version = ++readVersion.current
    setCsvText(null)
    setFileName('')
    setError('')
    setNotice('')
    setPreviewPage(0)
    if (!/\.csv$/i.test(file.name)) {
      setError('請選擇 .csv 檔案。Excel 或 Google 試算表請先下載為 CSV 格式。')
      return
    }
    if (file.size > PROGRAM_IMPORT_LIMITS.maxBytes) {
      setError(`檔案超過 ${PROGRAM_IMPORT_LIMITS.maxBytes / 1024 / 1024} MB，請分成較小的 CSV 再上傳。`)
      return
    }
    setReading(true)
    try {
      const buffer = await file.arrayBuffer()
      const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
      if (version !== readVersion.current) return
      setFileName(file.name)
      setCsvText(text)
    } catch {
      if (version === readVersion.current) setError('讀取失敗。請確認檔案使用 UTF-8 編碼，再重新選擇檔案。')
    } finally {
      if (version === readVersion.current) setReading(false)
    }
  }

  function reviewPastedCsv() {
    if (locked) return
    readVersion.current += 1
    setCsvText(null)
    setFileName('')
    setPreviewPage(0)
    setError('')
    setNotice('')
    if (!csvDraft.trim()) {
      setError('請先貼上包含欄位標題的 CSV 內容，再檢查資料。')
      return
    }
    if (new TextEncoder().encode(csvDraft).byteLength > PROGRAM_IMPORT_LIMITS.maxBytes) {
      setError(`貼上的內容超過 ${PROGRAM_IMPORT_LIMITS.maxBytes / 1024 / 1024} MB，請分批貼上並檢查。`)
      return
    }
    setFileName('貼上的 CSV')
    setCsvText(csvDraft)
  }

  function updateCsvDraft(value: string) {
    setCsvText(null)
    setFileName('')
    setNotice('')
    if (new TextEncoder().encode(value).byteLength > PROGRAM_IMPORT_LIMITS.maxBytes) {
      setError(`貼上的內容超過 ${PROGRAM_IMPORT_LIMITS.maxBytes / 1024 / 1024} MB，請分批貼上並檢查。`)
      return
    }
    setError('')
    setCsvDraft(value)
  }

  async function commit() {
    if (!preview || !canAdd || committing.current || reading) return
    committing.current = true
    setBusy(true)
    setError('')
    try {
      await onAdd(preview)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '新增未完成，請重試。你填寫的內容仍保留在這裡。')
    } finally {
      committing.current = false
      setBusy(false)
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(PROGRAM_IMPORT_PROMPT)
      setNotice('已複製 AI 提示詞。貼到你慣用的 AI，再告訴它想新增哪些學程。')
    } catch {
      setShowPrompt(true)
      setNotice('請在下方提示詞欄位選取文字並複製，或下載提示詞檔案。')
    }
  }

  function download(kind: 'template' | 'current' | 'prompt') {
    try {
      if (kind === 'template') downloadText(createProgramTemplateCsv(), 'Easier_program_template.csv')
      else if (kind === 'current') downloadText(createProgramsImportCsv(model), 'Easier_current_programs.csv')
      else downloadText(PROGRAM_IMPORT_PROMPT, 'Easier_AI_prompt.txt', 'text/plain;charset=utf-8')
      setError('')
      setNotice(kind === 'prompt' ? '已準備下載 AI 提示詞。' : '已準備下載 CSV，可用試算表編輯或交給 AI 填寫。')
    } catch {
      setError('無法產生下載檔案，請重試。')
    }
  }

  function renderField(field: (typeof PROGRAM_IMPORT_FIELDS)[number]) {
    const id = `add-program-${field.key.replace(/[^a-z0-9]/gi, '-')}`
    const placeholders: Record<string, string> = {
      University: '例如：University of Toronto',
      'Program Name': '例如：MSc in Computer Science',
      Degree: '例如：MSc、MA、PhD',
      Campus: '例如：Toronto, Canada',
      'Relevant Research Areas': '例如：Human–Computer Interaction',
      Notes: '研究重點、想申請的原因或待確認的資訊…',
    }
    return <label key={field.key} className={`wb-add-field${field.type === 'textarea' ? ' full' : ''}`} htmlFor={id}>
      <span>{field.label}{field.required && <small>必填</small>}</span>
      {field.type === 'textarea' ? <textarea id={id} rows={3} maxLength={PROGRAM_IMPORT_LIMITS.maxCellLength} value={values[field.key] ?? ''} placeholder={placeholders[field.key]} onChange={event => updateField(field.key, event.target.value)} /> : <input
        ref={field.key === 'University' ? firstField : undefined}
        id={id}
        type={field.type}
        required={field.required}
        inputMode={field.type === 'number' ? 'decimal' : field.type === 'url' ? 'url' : undefined}
        min={field.type === 'number' ? 0 : undefined}
        step={field.type === 'number' ? 'any' : undefined}
        maxLength={PROGRAM_IMPORT_LIMITS.maxCellLength}
        value={values[field.key] ?? ''}
        placeholder={field.type === 'url' ? 'https://…' : placeholders[field.key]}
        onChange={event => updateField(field.key, event.target.value)}
      />}
    </label>
  }

  return <dialog ref={dialog} className="wb-add-dialog" aria-labelledby="add-programs-title" aria-describedby="add-programs-description"
    onKeyDown={event => event.stopPropagation()}
    onCancel={event => { event.preventDefault(); if (!locked) onClose() }}>
    <header className="wb-add-header">
      <span className="wb-add-heading-icon"><GraduationCap size={23} /></span>
      <div><p className="wb-add-eyebrow">YOUR NEXT POSSIBILITY</p><h2 id="add-programs-title">新增學程</h2></div>
      <button className="wb-icon-button" aria-label="關閉新增學程" disabled={locked} onClick={onClose}><X size={21} /></button>
    </header>
    <p id="add-programs-description" className="wb-add-description">從一個感興趣的學程開始，或一次整理整份選校清單。</p>
    <div className="wb-add-tabs" role="tablist" aria-label="新增學程的方式">
      <button ref={manualTab} id="add-manual-tab" role="tab" aria-selected={mode === 'manual'} aria-controls="add-manual-panel" tabIndex={mode === 'manual' ? 0 : -1} disabled={locked} onKeyDown={tabKeyDown} onClick={() => changeMode('manual')}><Plus size={17} />手動新增<span>快速加入一個學程</span></button>
      <button ref={csvTab} id="add-csv-tab" role="tab" aria-selected={mode === 'csv'} aria-controls="add-csv-panel" tabIndex={mode === 'csv' ? 0 : -1} disabled={locked} onKeyDown={tabKeyDown} onClick={() => changeMode('csv')}><FileSpreadsheet size={17} />CSV 匯入<span>批次新增 · 可搭配 AI</span></button>
    </div>
    <div className="wb-add-content">
      <section role="tabpanel" id="add-manual-panel" aria-labelledby="add-manual-tab" hidden={mode !== 'manual'}>
        <form id="add-program-form" noValidate onSubmit={reviewForm}>
          <fieldset disabled={locked}>
            <legend className="wb-add-section-title">先填基本資料</legend>
            <p className="wb-add-hint">只需要學校與學程名稱，其他資訊可以之後再補。</p>
            <div className="wb-add-fields">{PROGRAM_IMPORT_FIELDS.filter(field => PRIMARY_FIELDS.has(field.key)).map(renderField)}</div>
            <details className="wb-add-details">
              <summary><ChevronDown size={16} /><span>補充申請資訊</span><small>選填</small></summary>
              <p className="wb-add-hint">不確定的內容可以留空；截止日請搭配官方來源，之後方便核對。</p>
              <div className="wb-add-fields">{PROGRAM_IMPORT_FIELDS.filter(field => !PRIMARY_FIELDS.has(field.key)).map(renderField)}</div>
            </details>
          </fieldset>
        </form>
      </section>
      <section role="tabpanel" id="add-csv-panel" aria-labelledby="add-csv-tab" hidden={mode !== 'csv'}>
        <div className="wb-add-csv-step"><span className="wb-add-step-number">1</span><div><h3>取得可以填寫的 CSV</h3><p>自己填寫，或交給你慣用的 AI 協助整理。</p><div className="wb-actions"><button className="wb-button" disabled={locked} onClick={() => download('template')}><Download size={15} />下載空白範本</button><button className="wb-button" disabled={locked} onClick={() => download('current')}><Download size={15} />下載現有學程（{model.programs.length}）</button></div><p className="wb-add-hint">現有 CSV 包含學程備註，交給 AI 前可先移除不想分享的內容。</p></div></div>
        <div className="wb-add-csv-step"><span className="wb-add-step-number">2</span><div><h3>讓 AI 幫你整理 <small>選用</small></h3><p>貼上提示詞與 CSV，告訴 AI 想新增哪些學程。它會依欄位整理，並保留資料來源。</p><div className="wb-actions"><button className="wb-button" disabled={locked} onClick={() => void copyPrompt()}><Copy size={15} />複製 AI 提示詞</button><button className="wb-text-button" disabled={locked} onClick={() => download('prompt')}><Download size={14} />下載提示詞</button><button className="wb-text-button" disabled={locked} aria-expanded={showPrompt} aria-controls="add-ai-prompt" onClick={() => setShowPrompt(value => !value)}>{showPrompt ? '收起內容' : '查看內容'}</button></div>{showPrompt && <textarea id="add-ai-prompt" className="wb-add-prompt" aria-label="AI 提示詞" readOnly value={PROGRAM_IMPORT_PROMPT} onFocus={event => event.target.select()} rows={9} />}</div></div>
        <div className="wb-add-csv-step"><span className="wb-add-step-number">3</span><div><h3>上傳並確認新增內容</h3><p>先檢查格式與重複學程，確認預覽後才會新增。</p><label className={`wb-add-upload${locked ? ' disabled' : ''}`}><Upload size={24} /><strong>{reading ? '正在讀取 CSV…' : fileName || '選擇填好的 CSV'}</strong><span>UTF-8 CSV · 最多 {PROGRAM_IMPORT_LIMITS.maxRows} 筆 · {PROGRAM_IMPORT_LIMITS.maxBytes / 1024 / 1024} MB</span><input type="file" accept=".csv,text/csv" aria-label="上傳學程 CSV" disabled={locked} onChange={event => { void readCsv(event.currentTarget.files?.[0]); event.currentTarget.value = '' }} /></label><details className="wb-add-details wb-add-paste"><summary><ChevronDown size={16} /><span>或貼上 CSV 文字</span></summary><p className="wb-add-hint">可直接貼上 AI 整理的 CSV，包含第一列欄位標題。若有程式碼框，請先移除。</p><textarea className="wb-add-prompt" aria-label="貼上學程 CSV" rows={7} disabled={locked} value={csvDraft} placeholder={'University,Program Name,Degree\n學校名稱,學程名稱,學位'} onChange={event => updateCsvDraft(event.target.value)} /><div className="wb-actions"><button className="wb-button" disabled={locked} onClick={reviewPastedCsv}><CheckCircle2 size={15} />檢查貼上的 CSV</button></div></details></div></div>
      </section>
      {notice && <p className="wb-add-notice" role="status"><CheckCircle2 size={16} />{notice}</p>}
      {error && <p className="wb-add-error" role="alert"><AlertCircle size={17} />{error}</p>}
      {preview && <ImportPreview preview={preview} page={previewPage} onPageChange={setPreviewPage} manual={mode === 'manual'} />}
    </div>
    <footer className="wb-add-footer">
      <p>{busy ? '正在儲存新增的學程…' : preview && canAdd ? `確認後加入 ${preview.readyCount} 個學程，已有的學程會保留。` : '新增後即可在「所有學程」繼續整理。'}</p>
      <div className="wb-actions"><button className="wb-button" disabled={locked} onClick={onClose}>取消</button>{mode === 'manual' && !reviewManual ? <button className="wb-button primary" type="submit" form="add-program-form" disabled={locked}>預覽學程<ArrowRight size={15} /></button> : <button className="wb-button primary" disabled={!canAdd || locked} onClick={() => void commit()}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />}新增 {preview?.readyCount ?? 0} 個學程</button>}</div>
    </footer>
  </dialog>
}

function ImportPreview({ preview, page, onPageChange, manual }: { preview: ProgramImportPreview; page: number; onPageChange: (page: number) => void; manual: boolean }) {
  const pages = Math.max(1, Math.ceil(preview.rows.length / PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const rows = preview.rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)
  return <section className="wb-add-preview" aria-label="新增學程預覽">
    <div className="wb-add-preview-heading"><h3 id="add-preview-title" tabIndex={-1}>確認{manual ? '學程' : '匯入'}內容</h3><span className="wb-add-preview-stats" role="status">可新增 {preview.readyCount} · 略過 {preview.duplicateCount} · 錯誤 {preview.invalidCount}</span></div>
    {preview.errors.length > 0 && <ul className="wb-add-errors" role="alert">{preview.errors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul>}
    {preview.warnings.length > 0 && <ul className="wb-add-warnings">{preview.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul>}
    {!!rows.length && <div className="wb-add-preview-table-wrap"><table className="wb-add-preview-table"><thead><tr>{!manual && <th scope="col">CSV 列</th>}<th scope="col">學校 / 學程</th><th scope="col">檢查結果</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.line}-${index}`} className={row.status}>
      {!manual && <td className="wb-add-line">{row.line}</td>}
      <td><strong>{row.university || '尚未填寫學校'}</strong><span>{row.programName || '尚未填寫學程'}</span>{row.degree && <small>{row.degree}</small>}<PreviewFields values={row.values} /></td>
      <td><span className={`wb-add-result ${row.status}`}>{row.status === 'ready' ? <Check size={13} /> : row.status === 'invalid' ? <AlertCircle size={13} /> : null}{row.status === 'ready' ? '新增' : row.status === 'duplicate' ? '已存在 · 略過' : '需要修正'}</span>{row.errors.length > 0 && <ul className="wb-add-row-errors">{row.errors.map((error, errorIndex) => <li key={`${errorIndex}-${error}`}>{error}</li>)}</ul>}{row.warnings.length > 0 && <ul className="wb-add-row-warnings">{row.warnings.map((warning, warningIndex) => <li key={`${warningIndex}-${warning}`}>{warning}</li>)}</ul>}</td>
    </tr>)}</tbody></table></div>}
    {pages > 1 && <div className="wb-add-pagination"><span>{current * PAGE_SIZE + 1}–{Math.min((current + 1) * PAGE_SIZE, preview.rows.length)} / {preview.rows.length} 筆</span><div className="wb-actions"><button className="wb-icon-button" aria-label="上一頁預覽" disabled={current === 0} onClick={() => onPageChange(current - 1)}><ArrowLeft size={16} /></button><span>{current + 1} / {pages}</span><button className="wb-icon-button" aria-label="下一頁預覽" disabled={current === pages - 1} onClick={() => onPageChange(current + 1)}><ArrowRight size={16} /></button></div></div>}
    {preview.invalidCount > 0 && <p className="wb-add-hint">{manual ? '請修正上方欄位，再重新預覽。' : '請修正標示的列，再重新上傳 CSV。所有錯誤修正後才能新增。'}</p>}
    {!preview.readyCount && preview.duplicateCount > 0 && !preview.invalidCount && <p className="wb-add-hint">這些學程已在清單中，沒有需要新增的內容。</p>}
    <p className="wb-add-verification-note"><AlertCircle size={14} />這裡只檢查格式與重複資料。截止日、費用與申請要求仍需以學校官方資訊核對。</p>
  </section>
}

function PreviewFields({ values }: { values: Record<string, CellValue> }) {
  const fields = PROGRAM_IMPORT_FIELDS.filter(field => !['University', 'Program Name', 'Degree'].includes(field.key) && values[field.key] != null && String(values[field.key]).trim() !== '')
  if (!fields.length) return null
  return <details className="wb-add-row-details"><summary>查看資料</summary><dl>{fields.map(field => {
    const value = values[field.key]
    return <div key={field.key}><dt>{field.label}</dt><dd>{value instanceof Date ? toDateInput(value) : String(value)}</dd></div>
  })}</dl></details>
}
