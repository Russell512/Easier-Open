import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AlertCircle, Check, Pencil, X } from 'lucide-react'
import type { ProgramView, WorkbookModel } from '../../types'
import { getValue, makeEdit, toDateInput } from '../../lib/workbook'
import { previewManualProgram, PROGRAM_IMPORT_FIELDS, PROGRAM_IMPORT_LIMITS } from '../../lib/programImport'
import type { EditHandler } from './helpers'
import './addPrograms.css'

const editableFields = PROGRAM_IMPORT_FIELDS.filter(field => !field.required)

export function EditProgramDialog({ program, model, onEdit, onClose }: {
  program: ProgramView
  model: WorkbookModel
  onEdit: EditHandler
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const firstField = useRef<HTMLInputElement>(null)
  const errorSummary = useRef<HTMLDivElement>(null)
  const saving = useRef(false)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(editableFields.map(field => {
    const value = getValue(program.row, field.key)
    return [field.key, field.type === 'date' ? toDateInput(value) : value == null ? '' : String(value)]
  })))

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const element = dialog.current
    element?.showModal()
    firstField.current?.focus()
    return () => {
      element?.close()
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  useEffect(() => {
    if (errors.length) errorSummary.current?.focus()
  }, [errors])

  function submit(event: FormEvent) {
    event.preventDefault()
    if (saving.current) return
    setErrors([])
    const originalName = String(getValue(program.row, 'Imported Program Name') || program.programName)
    const preview = previewManualProgram({ ...values, University: program.university, 'Program Name': originalName }, {
      ...model,
      programs: model.programs.filter(row => row.__id !== program.row.__id),
    })
    const row = preview.rows[0]
    if (preview.errors.length || !row || row.status === 'invalid') {
      setErrors([...preview.errors, ...(row?.errors ?? []), ...(!row ? ['無法檢查這份資料，請稍後重試。'] : [])])
      return
    }
    if (row.status === 'duplicate') {
      setErrors(['這組學校、學程、學位與校區已對應清單中的另一個學程，請確認學位與校區後再儲存。'])
      return
    }
    const changes = editableFields.map(field => ({ field: field.key, value: row.values[field.key] ?? null }))
      .filter(change => JSON.stringify(getValue(program.row, change.field)) !== JSON.stringify(change.value))
    if (changes.some(change => !makeEdit(model.workbook, program.row, change.field, change.value))) {
      setErrors(['部分欄位尚未準備好，請關閉並重新開啟學程後再試。'])
      return
    }
    saving.current = true
    setBusy(true)
    try {
      changes.forEach(change => onEdit(program.row, change.field, change.value))
      onClose()
    } catch {
      setErrors(['修改未完成，請檢查內容後重試。'])
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  return <dialog ref={dialog} className="wb-add-dialog" aria-labelledby="edit-program-title" aria-describedby="edit-program-description"
    onKeyDown={event => event.stopPropagation()}
    onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <header className="wb-add-header"><span className="wb-add-heading-icon"><Pencil size={22} /></span><div><p className="wb-add-eyebrow">YOUR PROGRAM DETAILS</p><h2 id="edit-program-title">編輯學程資料</h2></div><button className="wb-icon-button" aria-label="關閉編輯學程" disabled={busy} onClick={onClose}><X size={21} /></button></header>
    <p id="edit-program-description" className="wb-add-description">補上你找到的資訊，也可以清空不確定的內容。資料仍會標示為待核實。</p>
    <div className="wb-add-content">
      <div className="wb-edit-program-identity"><strong>{program.programName}</strong><span>{program.university}</span><small>學校與學程名稱固定；若是不同學程，請使用「新增學程」。</small></div>
      {errors.length > 0 && <div ref={errorSummary} tabIndex={-1} role="alert" className="wb-add-error"><AlertCircle size={17} /><ul>{errors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul></div>}
      <form id="edit-program-form" noValidate onSubmit={submit}>
        <fieldset disabled={busy}><legend className="wb-add-section-title">學程與申請資訊</legend><div className="wb-add-fields wb-edit-program-fields">{editableFields.map((field, index) => {
          const id = `edit-program-${field.key.replace(/[^a-z0-9]/gi, '-')}`
          const update = (value: string) => { setValues(current => ({ ...current, [field.key]: value })); setErrors([]) }
          return <label key={field.key} className={`wb-add-field${field.type === 'textarea' ? ' full' : ''}`} htmlFor={id}><span>{field.label}</span>{field.type === 'textarea' ? <textarea id={id} rows={3} maxLength={PROGRAM_IMPORT_LIMITS.maxCellLength} value={values[field.key] ?? ''} onChange={event => update(event.target.value)} /> : <input ref={index === 0 ? firstField : undefined} id={id} type={field.type} inputMode={field.type === 'number' ? 'decimal' : field.type === 'url' ? 'url' : undefined} min={field.type === 'number' ? 0 : undefined} step={field.type === 'number' ? 'any' : undefined} maxLength={PROGRAM_IMPORT_LIMITS.maxCellLength} placeholder={field.type === 'url' ? 'https://…' : undefined} value={values[field.key] ?? ''} onChange={event => update(event.target.value)} />}</label>
        })}</div></fieldset>
      </form>
      <p className="wb-add-verification-note"><AlertCircle size={14} />截止日、費用與申請要求請搭配官方來源核對。</p>
    </div>
    <footer className="wb-add-footer"><p>儲存後會更新這個學程的資料。</p><div className="wb-actions"><button className="wb-button" disabled={busy} onClick={onClose}>取消</button><button className="wb-button primary" type="submit" form="edit-program-form" disabled={busy}><Check size={16} />{busy ? '正在儲存…' : '儲存修改'}</button></div></footer>
  </dialog>
}
