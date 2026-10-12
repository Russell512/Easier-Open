import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
export const LOCAL_MODE = import.meta.env.VITE_LOCAL_MODE === 'true'
export const cloud = !LOCAL_MODE && url && key ? createClient(url, key) : null
export const CLOUD_BUCKET = 'easier-private'
export const LOCAL_CHANGE_EVENT = 'easier-local-change'
export function notifyLocalChange() { window.dispatchEvent(new Event(LOCAL_CHANGE_EVENT)) }
export function saveLocalValue(key: string, value: string) {
  localStorage.setItem(key, value)
  notifyLocalChange()
}
export async function fetchDefaultWorkbook(): Promise<ArrayBuffer> {
  if (!cloud) {
    const response = await fetch('./data/update_info.xlsx')
    if (!response.ok) throw new Error(`無法讀取預設 Excel（${response.status}）`)
    return response.arrayBuffer()
  }
  const { data: { user } } = await cloud.auth.getUser()
  if (!user) throw new Error('請先登入')
  const { data, error } = await cloud.storage.from(CLOUD_BUCKET).download(`${user.id}/seed/update_info.xlsx`)
  if (error) throw new Error(`無法讀取雲端原始 Excel：${error.message}`)
  return data.arrayBuffer()
}
