import { currentAccountGuard } from './accountSession'

export const DOCUMENT_CATEGORIES = ['CV', 'SOP', 'LoR', '成績單', '語言與考試', '作品與研究', '其他'] as const
export type DocumentCategory = typeof DOCUMENT_CATEGORIES[number]
export const DOCUMENT_STAGES = ['草稿', '待審閱', '定稿'] as const
export type DocumentStage = typeof DOCUMENT_STAGES[number]

export interface ApplicationDocument {
  id: string
  name: string
  category: DocumentCategory
  programId: string | null
  stage: DocumentStage
  note: string
  url?: string
  blob?: Blob
  size: number
  createdAt: string
  archived: boolean
}

const DB_NAME = 'easier-document-library-v1'
const STORE = 'documents'
export const MAX_FILE_SIZE = 25 * 1024 * 1024

export function safeWebUrl(value: string): string | null {
  try {
    const url = new URL(value.trim())
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch { return null }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('無法開啟本機文件儲存空間。請確認瀏覽器允許儲存資料。'))
    request.onblocked = () => reject(new Error('文件庫正在另一個分頁更新，請關閉舊分頁後重試。'))
  })
}

export async function readDocuments(): Promise<ApplicationDocument[]> {
  const guard = currentAccountGuard()
  guard?.assert()
  const db = await openDatabase()
  try { guard?.assert() } catch (error) { db.close(); throw error }
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readonly')
    const request = transaction.objectStore(STORE).getAll()
    transaction.oncomplete = () => { db.close(); try { guard?.assert(); resolve(request.result as ApplicationDocument[]) } catch (error) { reject(error) } }
    transaction.onabort = () => { db.close(); reject(new Error('無法讀取文件庫，請重新整理後重試。')) }
  })
}

export async function saveDocuments(documents: ApplicationDocument[], replace = false) {
  const guard = currentAccountGuard()
  guard?.assert()
  const db = await openDatabase()
  try { guard?.assert() } catch (error) { db.close(); throw error }
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite')
    const cancel = () => { try { transaction.abort() } catch { /* Already committed; it still belongs to the old account bank. */ } }
    guard?.signal.addEventListener('abort', cancel, { once: true })
    transaction.oncomplete = () => { guard?.signal.removeEventListener('abort', cancel); db.close(); try { guard?.assert(); if (typeof window !== 'undefined') window.dispatchEvent(new Event('easier-local-change')); resolve() } catch (error) { reject(error) } }
    transaction.onabort = () => { guard?.signal.removeEventListener('abort', cancel); db.close(); reject(new Error('文件未儲存：瀏覽器空間不足或帳號已切換。請先備份，再重試。')) }
    try {
      if (replace) transaction.objectStore(STORE).clear()
      for (const document of documents) transaction.objectStore(STORE).put(document)
    } catch { transaction.abort() }
  })
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export async function serializeDocuments(documents: ApplicationDocument[]) {
  const entries = await Promise.all(documents.map(async ({ blob, ...document }) => {
    const data = blob ? await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('檔案備份失敗，請重試。'))
      reader.readAsDataURL(blob)
    }) : undefined
    return { ...document, data }
  }))
  return JSON.stringify({ format: 'easier-documents', version: 1, entries })
}

export async function exportDocuments(documents: ApplicationDocument[]) {
  const guard = currentAccountGuard()
  guard?.assert()
  const serialized = await serializeDocuments(documents)
  guard?.assert()
  downloadBlob(new Blob([serialized], { type: 'application/json' }), `Easier-documents-${new Date().toISOString().slice(0, 10)}.json`)
}

export async function importDocuments(file: File): Promise<ApplicationDocument[]> {
  const guard = currentAccountGuard()
  guard?.assert()
  if (file.size > 200 * 1024 * 1024) throw new Error('備份過大，請使用小於 200 MB 的文件庫備份。')
  const documents = parseDocumentsBackup(JSON.parse(await file.text()))
  guard?.assert()
  await saveDocuments(documents)
  return documents
}

export function parseDocumentsBackup(backup: unknown, preserveIds = false): ApplicationDocument[] {
  if (!backup || typeof backup !== 'object' || !('format' in backup) || backup.format !== 'easier-documents' || !('version' in backup) || backup.version !== 1 || !('entries' in backup) || !Array.isArray(backup.entries)) throw new Error('這不是 Easier 文件庫備份。')
  const documents: ApplicationDocument[] = backup.entries.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw new Error('備份有無效項目。')
    const item = entry as Record<string, unknown>
    if (typeof item.name !== 'string' || !item.name.trim() || !DOCUMENT_CATEGORIES.includes(item.category as DocumentCategory) || !DOCUMENT_STAGES.includes(item.stage as DocumentStage) || (item.programId !== null && typeof item.programId !== 'string') || typeof item.note !== 'string') throw new Error('備份的文件欄位不完整。')
    let blob: Blob | undefined
    if (typeof item.data === 'string') {
      const match = /^data:([^;,]*);base64,([A-Za-z0-9+/=]*)$/.exec(item.data)
      if (!match || match[2]!.length > MAX_FILE_SIZE * 1.34) throw new Error('備份有無效或過大的檔案。')
      const bytes = Uint8Array.from(atob(match[2]!), (character) => character.charCodeAt(0))
      blob = new Blob([bytes], { type: match[1] || 'application/octet-stream' })
    }
    const url = typeof item.url === 'string' ? safeWebUrl(item.url) : null
    if (!blob && !url) throw new Error('備份缺少檔案或有效連結。')
    return {
      id: preserveIds && typeof item.id === 'string' && item.id ? item.id : crypto.randomUUID(), name: item.name, category: item.category as DocumentCategory,
      programId: item.programId as string | null, stage: item.stage as DocumentStage, note: item.note,
      blob, url: url ?? undefined, size: blob?.size ?? 0,
      createdAt: typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt)) ? item.createdAt : new Date().toISOString(), archived: item.archived === true,
    }
  })
  return documents
}

export function replaceDocuments(documents: ApplicationDocument[]) { return saveDocuments(documents, true) }
