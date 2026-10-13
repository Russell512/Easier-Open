import { fetchDefaultWorkbook, saveLocalValue } from './lib/cloudClient'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, FileSpreadsheet, X } from 'lucide-react'
import type { AppTab, CellValue, DataRow, PersistedTracker, SchoolSelectionState, SelectionResult, WorkbookModel } from './types'
import {
  arrayBufferToBase64, base64ToArrayBuffer, buildProgramViews, CHECKLIST_FIELDS,
  DEFAULT_FILE_NAME, displayValue, downloadJsonBackup,
  downloadWorkbook, downloadProgramsCsv, formatDate, getValue, makeEdit, migrateWorkbookEdits,
  editWorkbookModel, PRE_UPDATE_BACKUP_KEY, LEGACY_DEFAULT_FILES, parseWorkbook,
  STORAGE_KEY, serializeValue, programSearchText,
} from './lib/workbook'
import { assignSelectionResult, createInitialSchoolSelection, reconcileSchoolSelection, selectionStatusEdits } from './lib/selection'
import { SchoolSelectionPage } from './components/SchoolSelectionPage'
import { SopMaterialBankPage } from './components/SopMaterialBankPage'
import { CommandPalette, type CommandItem } from './components/ProductExperience'
import { NotesPage, NoteEditor } from './components/NotesPage'
import { useApplicationNotes } from './hooks/useApplicationNotes'
import { useDocuments } from './hooks/useDocuments'
import { useWorkspaceTabs } from './hooks/useWorkspaceTabs'
import { WorkbenchShell, WORKSPACE_NAV } from './components/workbench/WorkbenchShell'
import { OverviewPage } from './components/workbench/OverviewPage'
import { SchoolsPage, ComparisonPage } from './components/workbench/SchoolsPage'
import { SelectionResultsPage } from './components/workbench/SelectionResultsPage'
import { SchoolPage } from './components/workbench/SchoolPage'
import { DocumentsPage } from './components/workbench/DocumentsPage'
import { DatasetUpgradeStrip, WarningStrip, FacultyExplorer, FacultyDrawer, ChecklistPage, UpgradeBackup, DataCenter } from './components/TrackerViews'
import './components/workbench/workbench.css'

type EditHandler = (row: DataRow, field: string, value: CellValue) => void
const commandNavigationItems: CommandItem[] = WORKSPACE_NAV.map((item) => ({
  id: 'nav:' + item.id, kind: 'navigation', title: item.label, subtitle: '前往' + item.label,
  searchText: item.id, featured: true, target: { tab: item.id },
}))
function readCompareIds(): string[] {
  try { const ids: unknown = JSON.parse(localStorage.getItem('easier-comparison-v1') ?? '[]'); return Array.isArray(ids) ? [...new Set(ids.filter((id): id is string => typeof id === 'string'))].slice(0, 4) : [] } catch { return [] }
}
function isUpdatedDefaultDataset(model: WorkbookModel) {
  if (model.workbook.Sheets['Easier Template']?.A2?.v === 'easier-demo-v1') return model.programs.length > 0 && model.checklist.length === model.programs.length
  return model.workbook.Sheets['Program Catalog Guide']?.A2?.v === 'program-catalog-v2'
    && model.workbook.Sheets['Admissions Audit Guide']?.A2?.v === 'admissions-audit-2026-10-02'
    && model.programs.length > 0
    && model.programs.every((row) => Boolean(getValue(row, 'Program Name')))
    && model.checklist.length === model.programs.length
}

function valueAsDate(value: CellValue): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date
}

function App() {
  const applicationNotes = useApplicationNotes()
  const workspace = useWorkspaceTabs()
  const tab = workspace.active.tab
  const [source, setSource] = useState<{ base64: string; fileName: string } | null>(null)
  const [edits, setEdits] = useState<PersistedTracker['edits']>([])
  const [schoolSelection, setSchoolSelection] = useState<SchoolSelectionState | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selectedFacultyId, setSelectedFacultyId] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [checklistProgramId, setChecklistProgramId] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const jsonInput = useRef<HTMLInputElement>(null)

  const library = useDocuments()
  const [saveError, setSaveError] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [compareIds, setCompareIds] = useState<string[]>(readCompareIds)
  useEffect(() => {
    try { saveLocalValue('easier-comparison-v1', JSON.stringify(compareIds)) } catch { setToast('比較清單尚未儲存，請先備份資料。') }
  }, [compareIds])
  function navigate(nextTab: AppTab, school: string | null = null) {
    workspace.open(nextTab, school); setSelectedFacultyId(null)
  }
  function assignResult(id: string, result: SelectionResult) {
    setSchoolSelection((current) => current ? assignSelectionResult(current, id, result) : current)
  }
  function openSchool(id: string) { navigate(tab, id) }
  function toggleCompare(id: string) {
    const valid = compareIds.filter((item) => programs.some((program) => program.id === item))
    if (valid.includes(id)) setCompareIds(valid.filter((item) => item !== id))
    else if (valid.length < 4) setCompareIds([...valid, id])
    else setToast('最多同時比較 4 個學程，請先移除一個。')
  }

  async function loadDefaultWorkbook() {
    const buffer = await fetchDefaultWorkbook()
    const model = parseWorkbook(buffer)
    if (!isUpdatedDefaultDataset(model)) {
      throw new Error('新版學程資料驗證失敗，請檢查 Programs、Application Checklist 與 Program Catalog Guide。')
    }
    setSource({ base64: arrayBufferToBase64(buffer), fileName: DEFAULT_FILE_NAME })
    setEdits([])
    setSchoolSelection(createInitialSchoolSelection(model))
  }

  useEffect(() => {
    let cancelled = false
    async function initialize() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved) {
          const parsed = JSON.parse(saved) as PersistedTracker
          if (parsed.version === 1 && parsed.sourceBase64) {
            const model = parseWorkbook(base64ToArrayBuffer(parsed.sourceBase64), parsed.edits ?? [])
            if (LEGACY_DEFAULT_FILES.includes(parsed.fileName)) {
              try {
              const buffer = await fetchDefaultWorkbook()
              const next = parseWorkbook(buffer)
              if (!isUpdatedDefaultDataset(next)) throw new Error('update_info.xlsx 資料結構驗證失敗')
              const migration = migrateWorkbookEdits(model, next, parsed.edits ?? [])
              // Persist a recoverable snapshot before touching the working copy.
              localStorage.setItem(PRE_UPDATE_BACKUP_KEY, saved)
              if (!cancelled) {
                setSource({ base64: arrayBufferToBase64(buffer), fileName: DEFAULT_FILE_NAME })
                setEdits(migration.edits)
                setSchoolSelection(reconcileSchoolSelection(next, parsed.schoolSelection))
                setToast(`已更新資料並保留 ${migration.edits.length} 項修改。${migration.unresolved.length ? `${migration.unresolved.length} 項無法對應的修改保留在升級前備份。` : '升級前備份可在資料與匯出下載。'}`)
              }
              return
              } catch {
                if (!cancelled) setToast('暫時無法更新資料，已保留並載入原有進度；可稍後在上方切換新版資料。')
              }
            }
            if (!cancelled) {
              setSource({ base64: parsed.sourceBase64, fileName: parsed.fileName || DEFAULT_FILE_NAME })
              setEdits(parsed.edits ?? [])
              setSchoolSelection(reconcileSchoolSelection(model, parsed.schoolSelection))
              setLoading(false)
            }
            return
          }
        }
        await loadDefaultWorkbook()
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Workbook 載入失敗')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void initialize()
    return () => {
      cancelled = true
    }
  }, [])

  const baseParsed = useMemo(() => {
    if (!source) return { model: null as WorkbookModel | null, error: '' }
    try {
      return { model: parseWorkbook(base64ToArrayBuffer(source.base64)), error: '' }
    } catch (error) {
      return { model: null, error: error instanceof Error ? error.message : 'Workbook 解析失敗' }
    }
  }, [source])
  const parsed = useMemo(() => ({ ...baseParsed, model: baseParsed.model ? editWorkbookModel(baseParsed.model, edits) : null }), [baseParsed, edits])
  const automaticStatusEdits = useMemo(() => parsed.model && schoolSelection
    ? selectionStatusEdits(parsed.model, schoolSelection)
    : [], [parsed.model, schoolSelection])

  useEffect(() => {
    if (!automaticStatusEdits.length) return
    setEdits((current) => [
      ...current.filter((edit) => !automaticStatusEdits.some((next) => next.sheet === edit.sheet && next.address === edit.address)),
      ...automaticStatusEdits,
    ])
  }, [automaticStatusEdits])

  useEffect(() => {
    // Persist the category and its automatic status together, including older selections.
    if (!source || !schoolSelection || automaticStatusEdits.length) return
    const state: PersistedTracker = {
      version: 1,
      fileName: source.fileName,
      sourceBase64: source.base64,
      edits,
      schoolSelection,
      savedAt: new Date().toISOString(),
    }
    try {
      saveLocalValue(STORAGE_KEY, JSON.stringify(state))
      setSaveError(false)
    } catch {
      setSaveError(true)
      setToast('瀏覽器儲存空間不足；請先備份申請資料。')
    }
  }, [source, edits, schoolSelection, automaticStatusEdits])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 2800)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setShowCommandPalette((open) => !open)
      } else if (event.key === 'Escape') {
        setShowCommandPalette(false)
        setShowHelp(false)
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  const programs = useMemo(() => (parsed.model ? buildProgramViews(parsed.model) : []), [parsed.model])
  const reconcileTabs = workspace.reconcile
  useEffect(() => {
    if (parsed.model) reconcileTabs(new Set(programs.map((program) => program.id)), new Set(applicationNotes.state.notes.map(note => note.id)))
  }, [parsed.model, programs, reconcileTabs, workspace.activeId, applicationNotes.state.notes])
  const commandItems = useMemo<CommandItem[]>(() => {
    if (!parsed.model) return commandNavigationItems
    const items: CommandItem[] = [...commandNavigationItems]

    programs.forEach((program) => {
      items.push({
        id: `program:${program.id}`,
        kind: 'program',
        title: `${program.university} · ${program.programName}`,
        subtitle: `${program.degree} · ${program.status} · Research fit ${displayValue(program.researchFitScore)}`,
        searchText: programSearchText(program),
        target: { tab: 'programs', programId: program.id },
      })
      if (valueAsDate(program.deadline)) {
        items.push({
          id: `deadline:application:${program.id}`,
          kind: 'deadline',
          title: `${program.university} application deadline`,
          subtitle: `${program.programName} · ${formatDate(program.deadline)}`,
          searchText: `${program.university} ${program.programName} application deadline ${formatDate(program.deadline)}`,
          target: { tab: 'programs', programId: program.id },
        })
      }
      if (program.checklistRow) {
        CHECKLIST_FIELDS.filter((field) => field in program.checklistRow!.values).forEach((field) => {
          const status = displayValue(getValue(program.checklistRow, field))
          items.push({
            id: `checklist:${program.id}:${field}`,
            kind: 'checklist',
            title: `${field} · ${program.university}`,
            subtitle: `${program.programName} · ${status}`,
            searchText: `${field} ${program.university} ${program.programName} ${status}`,
            target: { tab: 'checklist', checklistProgramId: program.id },
          })
        })
      }
    })

    parsed.model.faculty.forEach((row) => {
      const name = displayValue(getValue(row, 'Faculty Name'))
      const university = displayValue(getValue(row, 'University'))
      const program = displayValue(getValue(row, 'Program'))
      items.push({
        id: `faculty:${row.__id}`,
        kind: 'faculty',
        title: name,
        subtitle: `${university} · ${program}`,
        searchText: `${name} ${university} ${program} ${displayValue(getValue(row, 'Research Areas'))} ${displayValue(getValue(row, 'Lab'))}`,
        target: { tab: 'faculty', facultyId: row.__id },
      })
    })

    parsed.model.masterTimeline.forEach((row) => {
      const date = getValue(row, 'Target Completion Date')
      if (!valueAsDate(date)) return
      const task = displayValue(getValue(row, 'Task'))
      items.push({
        id: `deadline:master:${row.__id}`,
        kind: 'deadline',
        title: task,
        subtitle: `Master Timeline · ${formatDate(date)} · ${displayValue(getValue(row, 'Priority'))}`,
        searchText: `${task} deadline ${formatDate(date)} ${displayValue(getValue(row, 'Priority'))}`,
        target: { tab: 'dashboard' },
      })
    })

    return items
  }, [parsed.model, programs])
  const selectedProgram = programs.find((program) => program.id === workspace.active.school) ?? null
  const selectedFaculty = parsed.model?.faculty.find((row) => row.__id === selectedFacultyId) ?? null

  function handleCommandSelect(item: CommandItem) {
    navigate(item.target.tab, item.target.programId ?? null)
    setSelectedFacultyId(item.target.facultyId ?? null)
    if (item.target.checklistProgramId) setChecklistProgramId(item.target.checklistProgramId)
  }

  const editCell: EditHandler = (row, field, value) => {
    if (!parsed.model) return
    const edit = makeEdit(parsed.model.workbook, row, field, value)
    if (!edit) {
      setToast(`欄位「${field}」不存在，未寫入資料。`)
      return
    }
    const original = baseParsed.model?.workbook.Sheets[edit.sheet]?.[edit.address]?.v ?? null
    if (JSON.stringify(serializeValue(original === '' ? null : original)) === JSON.stringify(serializeValue(value === '' ? null : value))) {
      setEdits((current) => current.filter((item) => !(item.sheet === edit.sheet && item.address === edit.address)))
      return
    }
    if (field === 'Application Status') {
      console.debug('[GraduateTracker:DnD] Workbook edit prepared', {
        programRow: row.__row,
        programId: row.__id,
        sheet: edit.sheet,
        cell: edit.address,
        nextStatus: value,
      })
    }
    setEdits((current) => [...current.filter((item) => !(item.sheet === edit.sheet && item.address === edit.address)), edit])
  }

  async function handleExcelImport(file: File) {
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setToast('請選擇 .xlsx 檔案。')
      return
    }
    try {
      const buffer = await file.arrayBuffer()
      const model = parseWorkbook(buffer)
      if (!model.programs.length) throw new Error('Excel 缺少可讀取的 Programs 資料')
      setLoadError('')
      setSource({ base64: arrayBufferToBase64(buffer), fileName: file.name })
      setEdits([])
      setSchoolSelection(createInitialSchoolSelection(model))
      workspace.open('data')
      setSelectedFacultyId(null)
      setToast(`已載入 ${file.name}`)
    } catch (error) {
      setToast(error instanceof Error ? `Excel 無法解析：${error.message}` : 'Excel 無法解析。')
    }
  }

  async function handleJsonImport(file: File) {
    try {
      const backup = JSON.parse(await file.text()) as PersistedTracker
      if (backup.version !== 1 || !backup.sourceBase64 || !Array.isArray(backup.edits)) throw new Error('備份格式不正確')
      const model = parseWorkbook(base64ToArrayBuffer(backup.sourceBase64), backup.edits)
      setSource({ base64: backup.sourceBase64, fileName: backup.fileName || DEFAULT_FILE_NAME })
      setEdits(backup.edits)
      setSchoolSelection(reconcileSchoolSelection(model, backup.schoolSelection))
      setToast('JSON backup 已還原。')
    } catch (error) {
      setToast(error instanceof Error ? `匯入失敗：${error.message}` : 'JSON backup 匯入失敗。')
    }
  }

  async function resetToOriginal() {
    if (!window.confirm('確定要清除所有網頁修改，重新載入原始 Excel 嗎？此動作無法復原。')) return
    try {
      localStorage.removeItem(STORAGE_KEY)
      await loadDefaultWorkbook()
      workspace.open('data')
      setSelectedFacultyId(null)
      setToast('已重設為原始 Excel。')
    } catch (error) {
      setToast(error instanceof Error ? error.message : '重設失敗。')
    }
  }

  async function reloadUpdatedDefaultWorkbook() {
    try {
      if (!source || !parsed.model) return
      const buffer = await fetchDefaultWorkbook()
      const next = parseWorkbook(buffer)
      if (!isUpdatedDefaultDataset(next)) throw new Error('新版資料結構驗證失敗')
      const migration = migrateWorkbookEdits(parsed.model, next, edits)
      localStorage.setItem(PRE_UPDATE_BACKUP_KEY, JSON.stringify({ version: 1, fileName: source.fileName, sourceBase64: source.base64, edits, schoolSelection, savedAt: new Date().toISOString() }))
      setSource({ base64: arrayBufferToBase64(buffer), fileName: DEFAULT_FILE_NAME })
      setEdits(migration.edits)
      setSchoolSelection(reconcileSchoolSelection(next, schoolSelection ?? undefined))
      workspace.open('data')
      setSelectedFacultyId(null)
      setToast(`新版資料已載入，保留 ${migration.edits.length} 項修改；升級前版本已備份。`)
    } catch (error) {
      setToast(error instanceof Error ? error.message : '新版 Excel 載入失敗。')
    }
  }


  const fatalError = loadError || parsed.error
  if (loading) return <div className="wb-loading"><FileSpreadsheet size={30} /><p>正在開啟你的申請工作區…</p></div>
  if (fatalError || !parsed.model || !source || !schoolSelection) return <div className="wb-loading"><AlertTriangle size={30} /><h1>資料無法載入</h1><p>{fatalError}</p><button className="wb-button primary" onClick={() => fileInput.current?.click()}>選擇 Excel 資料</button><input hidden ref={fileInput} type="file" accept=".xlsx" onChange={(event) => { if (event.target.files?.[0]) void handleExcelImport(event.target.files[0]) }} /></div>
  const model = parsed.model
  const validCompareIds = compareIds.filter((id) => programs.some((program) => program.id === id))
  const persisted: PersistedTracker = { version: 1, fileName: source.fileName, sourceBase64: source.base64, edits, schoolSelection, savedAt: new Date().toISOString() }
  const exportExcel = () => downloadWorkbook(model.workbook, source.fileName.replace(/\.xlsx$/i, '') + '_updated.xlsx', programs, schoolSelection)

  return <div className="wb-theme">
    <WorkbenchShell tab={tab} selectedProgram={selectedProgram} programs={programs} pages={workspace.pages} panes={workspace.panes} onSplit={workspace.split} onResize={workspace.resize} notes={applicationNotes} onOpenNote={id => { applicationNotes.selectNote(id); workspace.openNote(id) }} activeId={workspace.activeId} onActivate={(id) => { workspace.activate(id); setSelectedFacultyId(null) }} onClose={workspace.close} compareCount={validCompareIds.length} editCount={edits.length} saveError={saveError} onNavigate={navigate} onSearch={() => setShowCommandPalette(true)} onHelp={() => setShowHelp(true)}>
      {(page) => {
        const tab = page.tab
        const selectedProgram = programs.find((program) => program.id === page.school) ?? null
        return <>
      {!isUpdatedDefaultDataset(model) && <div className="wb-legacy"><DatasetUpgradeStrip onReload={() => void reloadUpdatedDefaultWorkbook()} /></div>}
      {page.noteId ? <NoteEditor notes={applicationNotes} noteId={page.noteId} /> : selectedProgram ? <SchoolPage key={selectedProgram.id} program={selectedProgram} programs={programs} selection={schoolSelection} onAssign={assignResult} onOpenProgram={openSchool} model={model} library={library} notes={applicationNotes} comparing={validCompareIds.includes(selectedProgram.id)} onToggleCompare={() => toggleCompare(selectedProgram.id)} onBack={() => navigate(tab)} onEdit={editCell} onSop={() => navigate('sop-materials')} onOpenFaculty={setSelectedFacultyId} /> : <>
        {tab === 'dashboard' && <OverviewPage programs={programs} model={model} selection={schoolSelection} library={library} onOpen={openSchool} onNavigate={navigate} />}
        {tab === 'programs' && <SchoolsPage onAssign={assignResult} programs={programs} model={model} selection={schoolSelection} compareIds={validCompareIds} onToggleCompare={toggleCompare} onCompare={() => navigate('compare')} onOpen={openSchool} onEdit={editCell} />}
        {tab === 'compare' && <ComparisonPage programs={programs} selection={schoolSelection} compareIds={validCompareIds} onToggle={toggleCompare} onOpen={openSchool} onBrowse={() => navigate('programs')} />}
        {tab === 'documents' && <DocumentsPage library={library} programs={programs} />}
        {tab === 'results' && <SelectionResultsPage model={model} programs={programs} selection={schoolSelection} onAssign={assignResult} onOpen={openSchool} />}
        {tab === 'selection' && <div className="wb-legacy"><SchoolSelectionPage model={model} programs={programs} selection={schoolSelection} onChange={setSchoolSelection} onOpenProgram={openSchool} onExport={exportExcel} /></div>}
        {tab === 'faculty' && <div className="wb-legacy"><FacultyExplorer model={model} onOpenFaculty={setSelectedFacultyId} /></div>}
        {tab === 'checklist' && <div className="wb-legacy"><ChecklistPage programs={programs} onEdit={editCell} focusProgramId={checklistProgramId} /></div>}
        {tab === 'sop-materials' && <div className="wb-legacy"><SopMaterialBankPage programs={programs} /></div>}
        {tab === 'notes' && <NotesPage notes={applicationNotes} onOpen={id => { applicationNotes.selectNote(id); workspace.openNote(id) }} />}
        {tab === 'data' && <div className="wb-legacy"><WarningStrip warnings={model.warnings} /><UpgradeBackup /><DataCenter model={model} fileName={source.fileName} editCount={edits.length} onExcelImport={() => fileInput.current?.click()} onExportExcel={exportExcel} onExportCsv={() => downloadProgramsCsv(model.workbook, programs, schoolSelection)} onExportJson={() => downloadJsonBackup(persisted)} onImportJson={() => jsonInput.current?.click()} onReset={() => void resetToOriginal()} /><p className="wb-footnote">這裡的 JSON 備份包含學校資料、材料進度與選校排序。實際文件請到「我的文件」備份；SOP 素材可於素材頁匯出。</p></div>}
      </>}
      </> }}
    </WorkbenchShell>
    <input ref={fileInput} hidden type="file" accept=".xlsx" onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void handleExcelImport(file) }} />
    <input ref={jsonInput} hidden type="file" accept=".json" onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void handleJsonImport(file) }} />
    {selectedFaculty && <div className="wb-legacy"><FacultyDrawer row={selectedFaculty} onClose={() => setSelectedFacultyId(null)} onEdit={editCell} /></div>}
    <div className="wb-legacy"><CommandPalette open={showCommandPalette} items={commandItems} onClose={() => setShowCommandPalette(false)} onSelect={handleCommandSelect} /></div>
    {showHelp && <div className="wb-modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setShowHelp(false) }}><section className="wb-help wb-panel" role="dialog" aria-modal="true" aria-label="工作區使用說明"><header className="wb-panel-header"><h2>你的申請工作區</h2><button autoFocus className="wb-icon-button" aria-label="關閉使用說明" onClick={() => setShowHelp(false)}><X size={18} /></button></header><div className="wb-panel-body"><p><strong>01 · 學校完整頁面</strong>從左側或學校卡片選一所學校，查看官方連結、申請時程、要求、材料與專屬文件。</p><p><strong>02 · 並排比較</strong>在所有學校勾選 2–4 個學程，到學校比較檢視差異。</p><p><strong>03 · 我的文件</strong>加入 CV、SOP、LoR 等檔案或連結，指定適用學校並標示草稿、待審閱或定稿。</p><p><strong>04 · 記錄與備份</strong>雲端模式會同步學校資料、文件、筆記與 SOP 素材；請確認上方顯示「已同步」再關閉。離線修改保留在本機，連線後重試。</p><button className="wb-button primary" onClick={() => setShowHelp(false)}>開始使用</button></div></section></div>}
    {toast && <div className="wb-toast" role="status">{toast}<button className="wb-icon-button" onClick={() => setToast('')} aria-label="關閉提示"><X size={14} /></button></div>}
  </div>
}
export default App
