import { useRef, useState, type FormEvent } from 'react'
import { Archive, ArrowDownToLine, ArrowUpFromLine, FileText, FolderOpen, Link2, Plus, RotateCcw, Search, Upload, X } from 'lucide-react'
import type { ProgramView } from '../../types'
import type { DocumentsController } from '../../hooks/useDocuments'
import { DOCUMENT_CATEGORIES, DOCUMENT_STAGES, MAX_FILE_SIZE, downloadBlob, exportDocuments, importDocuments, safeWebUrl, type ApplicationDocument, type DocumentCategory, type DocumentStage } from '../../lib/documents'
import { PageHeading } from './shared'

export function DocumentsPage({ library, programs, programId }: { library: DocumentsController; programs: ProgramView[]; programId?: string }) {
  const [category, setCategory] = useState('all')
  const [scope, setScope] = useState('all')
  const [query, setQuery] = useState('')
  const [archived, setArchived] = useState(false)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failure, setFailure] = useState('')
  const importInput = useRef<HTMLInputElement>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const inScope = library.documents.filter((doc) => (!programId || doc.programId === programId || doc.programId === null) && (scope === 'all' || (scope === 'shared' ? doc.programId === null : doc.programId === scope)))
  const filtered = inScope.filter((doc) => doc.archived === archived && (category === 'all' || doc.category === category) && `${doc.name} ${doc.note}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const total = inScope.filter((doc) => !doc.archived).length

  async function act(action: () => Promise<unknown>, success: string) {
    setBusy(true); setFailure(''); setMessage('')
    try { await action(); setMessage(success) }
    catch (error) { setFailure(error instanceof Error ? error.message : '操作失敗，請重試。') }
    finally { setBusy(false) }
  }

  return <section className="wb-documents">
    <PageHeading title={programId ? '學程文件' : '我的文件'} actions={<><button className="wb-button" disabled={busy || library.loading} onClick={() => void act(() => exportDocuments(library.documents), '文件庫備份已匯出，包含檔案、連結與封存項目。')}><ArrowDownToLine size={15} />備份</button><button className="wb-button primary" onClick={() => setAdding(true)} disabled={library.loading || !!library.error}><Plus size={16} />加入文件</button></>} />
    <div className="wb-document-types" aria-label="文件分類">
      {(['all', ...DOCUMENT_CATEGORIES] as const).map((type) => <button key={type} aria-pressed={category === type} onClick={() => setCategory(type)}><FileText size={18} /><span>{type === 'all' ? '全部文件' : type}</span><strong>{inScope.filter((doc) => !doc.archived && (type === 'all' || doc.category === type)).length}</strong></button>)}
    </div>
    {adding && <DocumentForm programs={programs} initialProgramId={programId ?? (scope !== 'all' && scope !== 'shared' ? scope : null)} initialCategory={category === 'all' ? 'CV' : category as DocumentCategory} onClose={() => setAdding(false)} onSave={async (items) => { await library.save(items); setAdding(false); setCategory('all'); setArchived(false); setScope('all'); setMessage(`已儲存 ${items.length} 份文件。`) }} />}
    <div className="wb-toolbar">
      <label className="wb-search"><Search size={16} /><input placeholder="搜尋文件名稱或備註…" aria-label="搜尋文件" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      {!programId && <select aria-label="文件所屬學校" value={scope} onChange={(event) => setScope(event.target.value)}><option value="all">所有學校與共用</option><option value="shared">共用文件</option>{programs.map((program) => <option key={program.id} value={program.id}>{program.university} · {program.programName}</option>)}</select>}
      <button className={`wb-button ${archived ? 'selected' : ''}`} aria-pressed={archived} onClick={() => setArchived(!archived)}><Archive size={14} />{archived ? '查看使用中' : '已封存'}</button>
      <button className="wb-icon-button" title="匯入文件庫備份" aria-label="匯入文件庫備份" disabled={busy} onClick={() => importInput.current?.click()}><ArrowUpFromLine size={17} /></button>
    </div>
    {message && <p className="wb-notice" role="status">{message}</p>}
    {(failure || library.error) && <p className="wb-notice error" role="alert">{failure || library.error}</p>}
    <div className="wb-panel">
      <div className="wb-panel-header"><h2><FolderOpen size={16} />{archived ? '已封存文件' : '文件與連結'} <span className="wb-count">{filtered.length}</span></h2><span className="wb-muted">{programId ? '包含共用版本' : `${total} 份使用中`}</span></div>
      {library.loading ? <p className="wb-empty">正在讀取文件…</p> : filtered.length ? <div className="wb-document-list">{filtered.map((doc) => {
        const program = programs.find((program) => program.id === doc.programId)
        return <article className="wb-document-row" key={doc.id}>
          <span className={`wb-file-icon ${doc.category.toLowerCase()}`}>{doc.url ? <Link2 size={21} /> : <FileText size={21} />}</span>
          <div className="wb-document-info"><strong>{doc.name}</strong><p><span>{doc.category}</span><span>{doc.programId ? program ? `${program.university} · ${program.degree}` : '原學校（目前資料庫未收錄）' : '所有學校共用'}</span><span>{doc.url ? '外部連結' : doc.size >= 1024 * 1024 ? `${(doc.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(doc.size / 1024))} KB`}</span><span>{new Date(doc.createdAt).toLocaleDateString('zh-TW')}</span></p>{doc.note && <p className="wb-document-note">{doc.note}</p>}</div>
          <select aria-label={`${doc.name} 文件狀態`} disabled={busy} value={doc.stage} onChange={(event) => void act(() => library.save([{ ...doc, stage: event.target.value as DocumentStage }]), '文件狀態已儲存。')}>{DOCUMENT_STAGES.map((stage) => <option key={stage}>{stage}</option>)}</select>
          <div className="wb-actions">{doc.url && safeWebUrl(doc.url) ? <a className="wb-button" href={safeWebUrl(doc.url)!} target="_blank" rel="noopener noreferrer"><Link2 size={14} />開啟</a> : doc.blob ? <button className="wb-icon-button" aria-label={`下載 ${doc.name}`} onClick={() => downloadBlob(doc.blob!, doc.name)}><ArrowDownToLine size={17} /></button> : null}
          <button className="wb-button" aria-expanded={editingId === doc.id} onClick={() => setEditingId(editingId === doc.id ? null : doc.id)}>編輯</button>
          <button disabled={busy} className="wb-icon-button" aria-label={`${doc.archived ? '還原' : '封存'} ${doc.name}`} title={doc.archived ? '還原文件' : '封存（可還原）'} onClick={() => void act(() => library.save([{ ...doc, archived: !doc.archived }]), doc.archived ? '文件已還原。' : '文件已封存，可在「已封存」找回。')}>{doc.archived ? <RotateCcw size={16} /> : <Archive size={16} />}</button></div>
          {editingId === doc.id && <DocumentMetadata key={doc.id} document={doc} programs={programs} onCancel={() => setEditingId(null)} onSave={(item) => void act(async () => { await library.save([item]); setEditingId(null) }, '文件資訊已儲存。')} />}
        </article>
      })}</div> : <div className="wb-empty"><FolderOpen size={34} /><h3>{query || category !== 'all' ? '沒有符合條件的文件' : archived ? '沒有封存的文件' : '尚無文件'}</h3><p>支援 PDF、Word、圖片與文件連結。</p>{!archived && <button className="wb-button primary" onClick={() => setAdding(true)}><Plus size={15} />加入第一份文件</button>}</div>}
    </div>
    <p className="wb-footnote"><span className="wb-dot" />「完整備份」包含學程資料、筆記、SOP 素材與文件。</p>
    <input hidden ref={importInput} type="file" accept=".json" aria-label="選擇文件庫備份" onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void act(async () => { await importDocuments(file); await library.refresh() }, '備份已加入文件庫，原有文件仍保留。') }} />
  </section>
}

function DocumentForm({ programs, initialProgramId, initialCategory, onClose, onSave }: { programs: ProgramView[]; initialProgramId: string | null; initialCategory: DocumentCategory; onClose: () => void; onSave: (items: ApplicationDocument[]) => Promise<void> }) {
  const [mode, setMode] = useState<'file' | 'link'>('file')
  const [files, setFiles] = useState<File[]>([])
  const [category, setCategory] = useState<DocumentCategory>(initialCategory)
  const [programId, setProgramId] = useState(initialProgramId ?? '')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const [stage, setStage] = useState<DocumentStage>('草稿')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    if (mode === 'file' && !files.length) { setError('請先選擇檔案。'); return }
    if (files.some((file) => file.size > MAX_FILE_SIZE) && mode === 'file') { setError('單一檔案上限 25 MB。較大的文件可以改用連結。'); return }
    const link = safeWebUrl(url)
    if (mode === 'link' && (!link || !name.trim())) { setError('請填寫名稱與有效的 http 或 https 連結。'); return }
    setBusy(true)
    const base = { category, programId: programId || null, stage, note: note.trim(), archived: false, createdAt: new Date().toISOString() }
    try {
      await onSave(mode === 'file' ? files.map((file) => ({ ...base, id: crypto.randomUUID(), name: file.name, blob: file, size: file.size })) : [{ ...base, id: crypto.randomUUID(), name: name.trim(), url: link!, size: 0 }])
    } catch (error) { setError(error instanceof Error ? error.message : '儲存失敗。') }
    finally { setBusy(false) }
  }
  return <form onSubmit={(event) => void submit(event)} className="wb-panel wb-document-form" aria-label="加入文件">
    <div className="wb-panel-header"><h2><Plus size={16} />加入文件</h2><button type="button" className="wb-icon-button" aria-label="取消加入文件" disabled={busy} onClick={onClose}><X size={18} /></button></div>
    <div className="wb-form-body"><div className="wb-segmented"><button type="button" aria-pressed={mode === 'file'} onClick={() => setMode('file')}><Upload size={14} />本機檔案</button><button type="button" aria-pressed={mode === 'link'} onClick={() => setMode('link')}><Link2 size={14} />外部連結</button></div>
      <div className="wb-form-grid"><label>文件類型<select value={category} onChange={(event) => setCategory(event.target.value as DocumentCategory)}>{DOCUMENT_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label><label>適用學校<select value={programId} onChange={(event) => setProgramId(event.target.value)}><option value="">共用文件 · 所有學校</option>{programs.map((program) => <option key={program.id} value={program.id}>{program.university} · {program.programName}</option>)}</select></label></div>
      {mode === 'file' ? <label className="wb-upload-zone"><Upload size={25} /><strong>選擇要加入的文件</strong><span>可一次選多份 · 每份最大 25 MB · 每次加入保留為獨立版本</span><input aria-label="選擇申請文件" type="file" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />{files.length > 0 && <span>{files.map((file) => file.name).join('、')}</span>}</label> : <div className="wb-form-grid"><label>文件名稱<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：Stanford SOP v2" /></label><label>文件連結<input required type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://docs.google.com/…" /></label></div>}
      <div className="wb-form-grid"><label>備註或版本說明<input value={note} onChange={(event) => setNote(event.target.value)} placeholder={category === 'LoR' ? '推薦人、邀請進度或参考資料說明' : '例如：v2 · 已請老師確認研究經歷'} /></label><label>文件狀態<select value={stage} onChange={(event) => setStage(event.target.value as DocumentStage)}>{DOCUMENT_STAGES.map((item) => <option key={item}>{item}</option>)}</select></label></div>
      {error && <p className="wb-notice error" role="alert">{error}</p>}<div className="wb-actions end"><button type="button" className="wb-button" onClick={onClose} disabled={busy}>取消</button><button className="wb-button primary" disabled={busy}>{busy ? '儲存中…' : '儲存文件'}</button></div>
    </div>
  </form>
}

function DocumentMetadata({ document, programs, onSave, onCancel }: { document: ApplicationDocument; programs: ProgramView[]; onSave: (item: ApplicationDocument) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(document)
  return <form className="wb-document-metadata wb-form-grid" onSubmit={(event) => { event.preventDefault(); if (!draft.name.trim()) return; onSave({ ...draft, name: draft.name.trim() }) }}>
    <label>文件名稱<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
    <label>適用學校<select value={draft.programId ?? ''} onChange={(event) => setDraft({ ...draft, programId: event.target.value || null })}><option value="">共用文件</option>{draft.programId && !programs.some((p) => p.id === draft.programId) && <option value={draft.programId}>原學校（目前資料庫未收錄）</option>}{programs.map((program) => <option key={program.id} value={program.id}>{program.university} · {program.programName}</option>)}</select></label>
    <label>文件類型<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as DocumentCategory })}>{DOCUMENT_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
    <label>備註<input value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></label>
    {document.url && <label>文件連結<input type="url" required value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} /></label>}
    <div className="wb-actions"><button type="button" className="wb-button" onClick={onCancel}>取消</button><button className="wb-button primary" disabled={!!draft.url && !safeWebUrl(draft.url)}>儲存變更</button></div>
  </form>
}
