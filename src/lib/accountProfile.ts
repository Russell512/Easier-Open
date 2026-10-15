import type { User } from '@supabase/supabase-js'
import { cloud } from './cloudClient'

export const AVATAR_BUCKET = 'easier-avatars'
export const LOCAL_PROFILE_KEY = 'easier-local-profile-v1'
export interface LocalProfile { name: string; avatar: string }
export type AvatarChange = { kind: 'keep' | 'google' | 'remove' } | { kind: 'upload'; blob: Blob }

export function googleAvatar(user: User | null): string {
  const raw = user?.identities?.find(identity => identity.provider === 'google')?.identity_data?.avatar_url
    ?? user?.user_metadata.avatar_url ?? user?.user_metadata.picture
  if (typeof raw !== 'string') return ''
  try { const url = new URL(raw); return url.protocol === 'https:' ? url.href : '' } catch { return '' }
}
export function ownAvatarPath(user: User | null): string {
  const path = user?.user_metadata.easier_avatar_path
  return user && typeof path === 'string' && path.startsWith(`${user.id}/`) && !path.includes('..') ? path : ''
}
export function profileName(user: User | null, local: LocalProfile): string {
  const name = user ? user.user_metadata.easier_display_name ?? user.user_metadata.full_name ?? user.user_metadata.name ?? user.email?.split('@')[0] : local.name
  return typeof name === 'string' && name.trim() ? name.trim().slice(0, 80) : '我的帳號'
}
export function readLocalProfile(): LocalProfile {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_PROFILE_KEY) || '{}')
    return { name: typeof raw.name === 'string' ? raw.name.slice(0, 80) : '', avatar: typeof raw.avatar === 'string' && /^data:image\/(webp|png|jpeg);base64,/.test(raw.avatar) && raw.avatar.length < 1_400_000 ? raw.avatar : '' }
  } catch { return { name: '', avatar: '' } }
}
export async function prepareAvatar(file: File): Promise<Blob> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('請選擇 JPG、PNG 或 WebP 圖片')
  if (file.size > 10 * 1024 * 1024) throw new Error('圖片需小於 10 MB')
  let bitmap: ImageBitmap
  try { bitmap = await createImageBitmap(file) } catch { throw new Error('無法讀取這張圖片，請換一個檔案') }
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 256; canvas.height = 256
    const context = canvas.getContext('2d')
    if (!context) throw new Error('瀏覽器無法處理圖片')
    const size = Math.min(bitmap.width, bitmap.height)
    context.drawImage(bitmap, (bitmap.width - size) / 2, (bitmap.height - size) / 2, size, size, 0, 0, 256, 256)
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('無法儲存圖片')), 'image/webp', 0.88))
  } finally { bitmap.close() }
}
export function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('無法讀取圖片'))
    reader.readAsDataURL(blob)
  })
}
export async function saveCloudProfile(user: User, name: string, avatar: AvatarChange): Promise<User> {
  if (!cloud) throw new Error('尚未登入')
  const previous = ownAvatarPath(user)
  const metadata: Record<string, string | boolean | null> = { easier_display_name: name.trim().slice(0, 80) }
  let uploaded = ''
  if (avatar.kind === 'upload') {
    uploaded = `${user.id}/${crypto.randomUUID()}.${avatar.blob.type === 'image/png' ? 'png' : 'webp'}`
    const { error } = await cloud.storage.from(AVATAR_BUCKET).upload(uploaded, avatar.blob, { contentType: avatar.blob.type, upsert: false })
    if (error) throw new Error('頭像上傳失敗，請重試')
    metadata.easier_avatar_path = uploaded
    metadata.easier_avatar_hidden = false
  } else if (avatar.kind === 'google' || avatar.kind === 'remove') {
    metadata.easier_avatar_path = null
    metadata.easier_avatar_hidden = avatar.kind === 'remove'
  }
  try {
    const { data, error } = await cloud.auth.updateUser({ data: metadata })
    if (error) throw error
    // Replace only after the new profile is saved, so a failed request preserves the old photo.
    if (previous && avatar.kind !== 'keep' && previous !== uploaded) await cloud.storage.from(AVATAR_BUCKET).remove([previous]).catch(() => undefined)
    return data.user
  } catch {
    if (uploaded) await cloud.storage.from(AVATAR_BUCKET).remove([uploaded]).catch(() => undefined)
    throw new Error('設定未儲存，請重試')
  }
}
