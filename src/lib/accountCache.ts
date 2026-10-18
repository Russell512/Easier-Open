import { readDocuments, replaceDocuments, type ApplicationDocument } from './documents'
import { SYNC_KEYS } from './cloudSnapshot'
import { assertCurrentAccount, type AccountGuard } from './accountSession'

export const ACTIVE_ACCOUNT_KEY = 'easier-active-account-v1'
export const ACCOUNT_SWITCH_KEY = 'easier-account-switch-v1'
export const ACCOUNT_CACHE_DB = 'easier-account-cache-v1'
export const ACCOUNT_LOCAL_KEYS = [...SYNC_KEYS, 'easier-cloud-baseline-v1', 'easier-workspace-tabs-v1', 'easier-local-profile-v1'] as const
const STORE = 'accounts'
interface AccountBank { id: string; values: Record<string, string>; documents: ApplicationDocument[]; savedAt: string }

function openCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ACCOUNT_CACHE_DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('無法保存帳號的本機備份，原有資料尚未切換。'))
    request.onblocked = () => reject(new Error('另一個分頁正在更新本機備份，請關閉後重試。'))
  })
}
async function cacheRead(id: string): Promise<AccountBank | undefined> {
  const db = await openCache()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readonly')
    const request = transaction.objectStore(STORE).get(id)
    transaction.oncomplete = () => { db.close(); resolve(request.result as AccountBank | undefined) }
    transaction.onabort = () => { db.close(); reject(new Error('無法讀取帳號的本機備份。')) }
  })
}
async function cacheWrite(bank: AccountBank): Promise<void> {
  const db = await openCache()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite')
    transaction.oncomplete = () => { db.close(); resolve() }
    transaction.onabort = () => { db.close(); reject(new Error('本機備份未完成，請釋放瀏覽器儲存空間後重試。原有資料尚未切換。')) }
    try { transaction.objectStore(STORE).put(bank) }
    catch { transaction.abort() }
  })
}
function localValues() {
  return Object.fromEntries(ACCOUNT_LOCAL_KEYS.flatMap(key => {
    const value = localStorage.getItem(key)
    return value === null ? [] : [[key, value]]
  }))
}
function baselineOwner(values: Record<string, string>): string | null {
  try {
    const saved = JSON.parse(values['easier-cloud-baseline-v1'] || 'null')
    return saved && typeof saved.userId === 'string' && saved.userId ? saved.userId : null
  } catch { return null }
}
async function captureBank(id: string, guard: AccountGuard): Promise<AccountBank> {
  guard.assert()
  const values = localValues()
  const documents = await readDocuments()
  guard.assert()
  return { id, values, documents, savedAt: new Date().toISOString() }
}

export async function preserveActiveAccount(userId: string, guard: AccountGuard) {
  guard.assert(); assertCurrentAccount(userId)
  if (localStorage.getItem(ACTIVE_ACCOUNT_KEY) !== userId || localStorage.getItem(ACCOUNT_SWITCH_KEY)) throw new Error('工作區尚未完成切換，請重新載入。')
  await cacheWrite(await captureBank(userId, guard))
  guard.assert()
}

/** Called only while holding the browser-wide editor lock, before mounting App. */
export async function activateAccountBank(userId: string, guard: AccountGuard): Promise<{ switched: boolean; quarantined: boolean }> {
  guard.assert()
  if (guard.userId !== userId) throw new Error('工作區帳號不符。')
  const interrupted = localStorage.getItem(ACCOUNT_SWITCH_KEY)
  const values = localValues()
  const markedOwner = localStorage.getItem(ACTIVE_ACCOUNT_KEY)
  const legacyOwner = baselineOwner(values)
  if (!interrupted && markedOwner && legacyOwner && markedOwner !== legacyOwner) throw new Error('本機資料的帳號標記不一致，資料已保留，請先重新載入。')
  const owner = markedOwner || legacyOwner
  if (!interrupted && owner === userId) {
    localStorage.setItem(ACTIVE_ACCOUNT_KEY, userId)
    return { switched: false, quarantined: false }
  }
  let quarantined = false
  if (!interrupted) {
    const prior = await captureBank(owner || `unclaimed:${crypto.randomUUID()}`, guard)
    if (owner || Object.keys(prior.values).length || prior.documents.length) {
      await cacheWrite(prior)
      guard.assert()
      quarantined = !owner
    }
  }
  // A journal means the live bank may be partial. Never archive it over a good backup.
  let target = await cacheRead(userId)
  guard.assert()
  if (!target) {
    target = { id: userId, values: {}, documents: [], savedAt: new Date().toISOString() }
    await cacheWrite(target)
    guard.assert()
  }
  if (target.id !== userId || (baselineOwner(target.values) && baselineOwner(target.values) !== userId)) throw new Error('本機備份的帳號不符，已停止載入。')
  localStorage.setItem(ACCOUNT_SWITCH_KEY, JSON.stringify({ target: userId, startedAt: new Date().toISOString() }))
  // Both complete account banks are durable before changing either live store.
  await replaceDocuments(target.documents)
  guard.assert()
  for (const key of ACCOUNT_LOCAL_KEYS) localStorage.removeItem(key)
  for (const key of ACCOUNT_LOCAL_KEYS) if (target.values[key] !== undefined) localStorage.setItem(key, target.values[key])
  localStorage.setItem(ACTIVE_ACCOUNT_KEY, userId)
  localStorage.removeItem(ACCOUNT_SWITCH_KEY)
  return { switched: true, quarantined }
}
