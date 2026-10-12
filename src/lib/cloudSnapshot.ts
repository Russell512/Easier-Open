import { cloud, CLOUD_BUCKET } from './cloudClient'
import { readDocuments, replaceDocuments, parseDocumentsBackup, serializeDocuments, downloadBlob, type ApplicationDocument } from './documents'
import { STORAGE_KEY, PRE_UPDATE_BACKUP_KEY, base64ToArrayBuffer, parseWorkbook, buildProgramViews, createExportWorkbook } from './workbook'
import { reconcileSchoolSelection } from './selection'
import type { PersistedTracker } from '../types'

export const SYNC_KEYS = [STORAGE_KEY, PRE_UPDATE_BACKUP_KEY, 'easier-application-notes-v2', 'easier-global-notes-v1', 'easier-sop-material-bank-v1', 'easier-comparison-v1'] as const
export type CloudDocument = Omit<ApplicationDocument, 'blob'> & { path?: string; mime?: string }
export interface Snapshot {
  format: 'easier-cloud-v1'
  values: Record<string, string>
  documents: CloudDocument[]
  workbookPath?: string
}
export interface CloudRow { revision: number; payload: Snapshot; updated_at: string }
export interface Baseline { userId: string; revision: number; signature: string }
const BASELINE_KEY = 'easier-cloud-baseline-v1'
const blobCache = new Map<string, { path: string; blob: Blob }>()
const uploaded = new Set<string>()
let excelCache: { source: string; path: string; blob: Blob } | undefined
export async function readBaseline(): Promise<Baseline | null> {
  try {
    const value = JSON.parse(localStorage.getItem(BASELINE_KEY) || 'null') as Baseline | null
    if (!value || typeof value.userId !== 'string' || !Number.isInteger(value.revision) || typeof value.signature !== 'string') return null
    // Older versions stored the entire snapshot as a signature. Compact it before
    // loading a larger workbook so the baseline cannot exhaust localStorage.
    if (value.signature.startsWith('{')) {
      const previous = JSON.parse(value.signature) as Snapshot
      if (!previous.values || !Array.isArray(previous.documents)) return null
      value.signature = await snapshotSignature(previous)
      writeBaseline(value)
    }
    return value
  } catch { return null }
}
export function writeBaseline(value: Baseline) { localStorage.setItem(BASELINE_KEY, JSON.stringify(value)) }
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]))
  return value
}
export async function snapshotSignature(snapshot: Snapshot): Promise<string> {
  const values: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(snapshot.values)) {
    const value = JSON.parse(raw)
    if (key === STORAGE_KEY && value && typeof value === 'object') delete value.savedAt
    values[key] = value
  }
  const documents = [...snapshot.documents].sort((a, b) => a.id.localeCompare(b.id))
  return `sha256:${await hash(new Blob([JSON.stringify(stable({ values, documents }))]))}`
}

export function needsConflictResolution(saved: Baseline | null, userId: string, localSignature: string, remote: { revision: number; signature: string } | null, hasLocal: boolean): boolean {
  if (saved && saved.userId !== userId) return true
  // A previous restore can succeed even if recording its baseline failed. Equal
  // content is already synchronized, regardless of an absent or older baseline.
  if (!remote || localSignature === remote.signature) return false
  const localDirty = saved ? localSignature !== saved.signature : hasLocal
  return localDirty && (!saved || saved.revision !== remote.revision)
}
async function hash(blob: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
export async function captureSnapshot(userId: string): Promise<{ snapshot: Snapshot; files: Map<string, Blob> }> {
  const values: Record<string, string> = {}
  for (const key of SYNC_KEYS) {
    const value = localStorage.getItem(key)
    // Empty comparisons were a local-only default; keep old clean baselines compatible.
    if (value !== null && !(key === 'easier-comparison-v1' && value === '[]')) values[key] = value
  }
  const documents: CloudDocument[] = []
  const files = new Map<string, Blob>()
  for (const { blob, ...doc } of (await readDocuments()).sort((a, b) => a.id.localeCompare(b.id))) {
    if (blob) {
      const cacheKey = `${userId}/${doc.id}/${doc.createdAt}/${blob.size}`
      let cached = blobCache.get(cacheKey)
      if (!cached) { cached = { path: `${userId}/files/${await hash(blob)}`, blob }; blobCache.set(cacheKey, cached) }
      files.set(cached.path, cached.blob)
      documents.push({ ...doc, path: cached.path, mime: blob.type })
    } else documents.push(doc)
  }
  return { snapshot: { format: 'easier-cloud-v1', values, documents }, files }
}
export async function addExcelExport(userId: string, snapshot: Snapshot, files: Map<string, Blob>) {
  const raw = snapshot.values[STORAGE_KEY]
  if (!raw) return
  const tracker = JSON.parse(raw) as PersistedTracker
  const source = JSON.stringify({ ...tracker, savedAt: '' })
  if (excelCache?.source !== source || !excelCache.path.startsWith(`${userId}/`)) {
    const model = parseWorkbook(base64ToArrayBuffer(tracker.sourceBase64), tracker.edits)
    const blob = new Blob([createExportWorkbook(model.workbook, buildProgramViews(model), reconcileSchoolSelection(model, tracker.schoolSelection))], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    excelCache = { source, path: `${userId}/exports/${await hash(blob)}.xlsx`, blob }
  }
  snapshot.workbookPath = excelCache.path
  files.set(excelCache.path, excelCache.blob)
}
export async function readCloud(userId: string): Promise<CloudRow | null> {
  const { data, error } = await cloud!.from('easier_workspaces').select('revision,payload,updated_at').eq('user_id', userId).maybeSingle()
  if (error) throw new Error(error.message)
  return data as CloudRow | null
}
export async function pushCloud(snapshot: Snapshot, files: Map<string, Blob>, expectedRevision: number): Promise<number> {
  for (const [path, blob] of files) {
    if (uploaded.has(path)) continue
    const { error } = await cloud!.storage.from(CLOUD_BUCKET).upload(path, blob, { upsert: false, contentType: blob.type || 'application/octet-stream' })
    if (error && !['409', 'Duplicate'].includes(String(error.statusCode)) && !/already exists|duplicate/i.test(error.message)) throw new Error(`檔案上傳失敗：${error.message}`)
    uploaded.add(path)
  }
  const { data, error } = await cloud!.rpc('save_easier_workspace', { expected_revision: expectedRevision, next_payload: snapshot })
  if (error) throw new Error(error.code === 'PT409' ? 'SYNC_CONFLICT' : error.message)
  return Number(data)
}
export async function applySnapshot(snapshot: Snapshot, userId: string) {
  if (snapshot.format !== 'easier-cloud-v1' || !snapshot.values || !Array.isArray(snapshot.documents)) throw new Error('雲端備份格式錯誤')
  // Validate and download every file before touching the local copy.
  if (snapshot.values[STORAGE_KEY]) {
    const tracker = JSON.parse(snapshot.values[STORAGE_KEY]) as PersistedTracker
    parseWorkbook(base64ToArrayBuffer(tracker.sourceBase64), tracker.edits)
  }
  for (const key of SYNC_KEYS) if (snapshot.values[key]) JSON.parse(snapshot.values[key])
  const documents: ApplicationDocument[] = []
  for (const { path, mime, ...doc } of snapshot.documents) {
    let blob: Blob | undefined
    if (path) {
      if (!path.startsWith(`${userId}/`)) throw new Error('文件所屬帳號不符')
      const { data, error } = await cloud!.storage.from(CLOUD_BUCKET).download(path)
      if (error) throw new Error(`文件下載失敗：${error.message}`)
      blob = data.slice(0, data.size, mime || data.type)
    }
    documents.push({ ...doc, blob })
  }
  const before = SYNC_KEYS.map((key) => [key, localStorage.getItem(key)] as const)
  try {
    for (const key of SYNC_KEYS) {
      if (snapshot.values[key] !== undefined) localStorage.setItem(key, snapshot.values[key])
      else localStorage.removeItem(key)
    }
    await replaceDocuments(documents)
    blobCache.clear(); excelCache = undefined
  } catch (error) {
    for (const [key, value] of before) { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value) }
    throw error
  }
}
export async function exportFullBackup() {
  const values: Record<string, string> = {}
  for (const key of SYNC_KEYS) { const value = localStorage.getItem(key); if (value !== null) values[key] = value }
  const documents = JSON.parse(await serializeDocuments(await readDocuments()))
  downloadBlob(new Blob([JSON.stringify({ format: 'easier-full-backup', version: 1, values, documents })], { type: 'application/json' }), `Easier-full-backup-${new Date().toISOString().slice(0, 10)}.json`)
}
export async function downloadCloudExcel(userId: string) {
  const row = await readCloud(userId)
  if (!row?.payload.workbookPath) throw new Error('尚未產生雲端 Excel，請先等候同步完成')
  const { data, error } = await cloud!.storage.from(CLOUD_BUCKET).download(row.payload.workbookPath)
  if (error) throw new Error(error.message)
  downloadBlob(data, 'Easier_latest.xlsx')
}

export async function importFullBackup(file: File) {
  if (file.size > 200 * 1024 * 1024) throw new Error('完整備份上限為 200 MB')
  const backup = JSON.parse(await file.text())
  if (backup?.format !== 'easier-full-backup' || backup.version !== 1 || !backup.values || typeof backup.values !== 'object') throw new Error('請選擇 Easier 完整備份')
  const documents = parseDocumentsBackup(backup.documents, true)
  const values: Record<string, string> = {}
  for (const key of SYNC_KEYS) {
    if (backup.values[key] !== undefined) {
      if (typeof backup.values[key] !== 'string') throw new Error('備份內容格式錯誤')
      JSON.parse(backup.values[key]); values[key] = backup.values[key]
    }
  }
  if (!values[STORAGE_KEY]) throw new Error('備份缺少學校資料')
  const tracker = JSON.parse(values[STORAGE_KEY]) as PersistedTracker
  if (tracker.version !== 1 || !Array.isArray(tracker.edits)) throw new Error('學校資料格式錯誤')
  parseWorkbook(base64ToArrayBuffer(tracker.sourceBase64), tracker.edits)
  const before = SYNC_KEYS.map((key) => [key, localStorage.getItem(key)] as const)
  try {
    for (const key of SYNC_KEYS) { if (values[key] !== undefined) localStorage.setItem(key, values[key]); else localStorage.removeItem(key) }
    await replaceDocuments(documents)
    blobCache.clear(); excelCache = undefined
  } catch (error) {
    for (const [key, value] of before) { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value) }
    throw error
  }
}
