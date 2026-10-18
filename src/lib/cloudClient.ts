import { createClient } from '@supabase/supabase-js'
import { assertCurrentAccount, createAccountGuard, currentAccountGuard } from './accountSession'
import { createAccountCloud } from './accountCloud'
import { createStarterWorkbook, isMissingSeedError } from './starterWorkbook'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
export const LOCAL_MODE = import.meta.env.VITE_LOCAL_MODE === 'true'
export const cloud = !LOCAL_MODE && url && key ? createClient(url, key) : null
export const CLOUD_BUCKET = 'easier-private'
export const LOCAL_CHANGE_EVENT = 'easier-local-change'
export function notifyLocalChange() { window.dispatchEvent(new Event(LOCAL_CHANGE_EVENT)) }
export function saveLocalValue(key: string, value: string) {
  assertCurrentAccount()
  localStorage.setItem(key, value)
  notifyLocalChange()
}
export async function fetchDefaultWorkbook(): Promise<ArrayBuffer> {
  if (LOCAL_MODE || (import.meta.env.DEV && !cloud)) {
    const response = await fetch('./data/update_info.xlsx')
    if (!response.ok) throw new Error(`無法讀取預設 Excel（${response.status}）`)
    return response.arrayBuffer()
  }
  if (!cloud) throw new Error('雲端連線尚未設定，請稍後重試。')
  const guard = currentAccountGuard()
  guard?.assert()
  const { data: { session }, error: sessionError } = await cloud.auth.getSession()
  guard?.assert()
  if (sessionError) throw new Error(`無法確認登入狀態：${sessionError.message}`)
  if (!session) throw new Error('請先登入')
  if (guard && guard.userId !== session.user.id) throw new Error('資料所屬帳號不符，已停止讀取。')
  const { data: { user }, error: authError } = await cloud.auth.getUser(session.access_token)
  guard?.assert()
  if (authError) throw new Error(`無法確認登入狀態：${authError.message}`)
  if (!user) throw new Error('請先登入')
  if (user.id !== session.user.id) throw new Error('登入帳號回應不符，已停止讀取。')
  const account = createAccountCloud(session, guard ?? createAccountGuard(user.id))
  const { data, error } = await account.client.storage.from(CLOUD_BUCKET).download(`${user.id}/seed/update_info.xlsx`)
  account.assert()
  if (error) {
    if (isMissingSeedError(error)) return createStarterWorkbook()
    throw new Error(`無法讀取雲端原始 Excel：${error.message}`)
  }
  if (!data) throw new Error('雲端原始 Excel 沒有回傳內容，請重試。')
  const buffer = await data.arrayBuffer()
  account.assert()
  return buffer
}
