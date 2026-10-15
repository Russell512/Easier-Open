import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Cloud, CloudOff, Download, FileSpreadsheet, KeyRound, LoaderCircle, LogOut, RefreshCw, Settings, Upload, UserRound, X } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { useWorkspaceAccount } from '../lib/workspaceAccount'
import { cloud } from '../lib/cloudClient'
import { AVATAR_BUCKET, LOCAL_PROFILE_KEY, blobDataUrl, googleAvatar, ownAvatarPath, prepareAvatar, profileName, readLocalProfile, saveCloudProfile, type AvatarChange, type LocalProfile } from '../lib/accountProfile'
import './accountMenu.css'

function useAvatar(user: User | null, local: LocalProfile) {
  const path = ownAvatarPath(user)
  const key = `${user?.id ?? ''}/${path}`
  const [signed, setSigned] = useState({ key: '', url: '' })
  useEffect(() => {
    if (!path || !cloud) return
    let cancelled = false
    const refresh = async () => {
      try {
        const { data, error } = await cloud!.storage.from(AVATAR_BUCKET).createSignedUrl(path, 3600)
        if (!cancelled) setSigned({ key, url: error ? '' : data?.signedUrl ?? '' })
      } catch { if (!cancelled) setSigned({ key, url: '' }) }
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 50 * 60 * 1000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [path, key])
  if (!user) return local.avatar
  if (path) return signed.key === key ? signed.url : ''
  return user.user_metadata.easier_avatar_hidden ? '' : googleAvatar(user)
}

function Avatar({ src, name, large = false }: { src: string; name: string; large?: boolean }) {
  const [failed, setFailed] = useState('')
  return <span className={`account-avatar${large ? ' large' : ''}`}>
    {src && src !== failed ? <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(src)} /> : <span aria-hidden="true">{name === '我的帳號' ? <UserRound size={large ? 30 : 16} /> : Array.from(name)[0]?.toUpperCase()}</span>}
  </span>
}

export function WorkspaceSyncStatus() {
  const account = useWorkspaceAccount()
  if (!account) return <><Check size={12} />本機副本已保存</>
  const problem = !!account.error || account.conflict || account.remoteChanged
  const syncing = /正在|等待/.test(account.status)
  return <span className={`account-sync-status${problem ? ' needs-attention' : ''}`} role="status" title={account.error || account.status}>
    {problem ? <CloudOff size={13} /> : account.local ? <Check size={12} /> : syncing ? <RefreshCw size={12} className="account-spinning" /> : <Cloud size={13} />}
    {problem ? '同步需要處理' : account.local ? '本機副本已保存' : syncing ? '同步中…' : account.status.split(' · ')[0]}
  </span>
}

export function AccountMenu() {
  const account = useWorkspaceAccount()
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState<'profile' | 'password' | null>(null)
  const [local, setLocal] = useState(readLocalProfile)
  const [actionBusy, setActionBusy] = useState(false)
  const host = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const user = account?.user ?? null
  const name = profileName(user, local)
  const avatar = useAvatar(user, local)
  useEffect(() => {
    const updated = (event: StorageEvent) => { if (event.key === LOCAL_PROFILE_KEY) setLocal(readLocalProfile()) }
    window.addEventListener('storage', updated)
    return () => window.removeEventListener('storage', updated)
  }, [])
  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true })
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !host.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  function close(focus = false) { setOpen(false); if (focus) requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true })) }
  async function action(callback: () => Promise<void>) {
    close(true); setActionBusy(true)
    try { await callback() } finally { setActionBusy(false) }
  }
  if (!account) return null
  const disabled = account.busy || actionBusy
  return <div className="account-menu-host" ref={host} onBlur={event => {
    if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) close()
  }}>
    <button ref={trigger} className="account-trigger" aria-label="帳號選單" title={name} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)} onKeyDown={event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true) }
    }}><Avatar src={avatar} name={name} /></button>
    {open && <div className="account-menu" ref={menu} role="menu" aria-label="帳號與設定" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true) }
      if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
        event.preventDefault()
        const buttons = Array.from(menu.current!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'))
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
        buttons[next]?.focus()
      }
    }}>
      <div className="account-menu-profile"><Avatar src={avatar} name={name} /><div><strong>{name}</strong><small>{user?.email || '本機工作區'}</small></div></div>
      <div className="account-menu-status"><WorkspaceSyncStatus /><small>{account.local ? '資料保存在此瀏覽器' : '自動同步已開啟'}</small></div>
      <button role="menuitem" tabIndex={-1} onClick={() => { close(); setSettings('profile') }}><Settings size={16} />設定</button>
      <div className="account-menu-divider" role="separator" />
      {!account.local && <button role="menuitem" tabIndex={-1} disabled={disabled || !account.ready || account.conflict || account.remoteChanged} onClick={() => void action(account.sync)}><RefreshCw size={16} />立即同步</button>}
      <button role="menuitem" tabIndex={-1} disabled={disabled} onClick={() => void action(account.backup)}><Download size={16} />完整備份</button>
      <button role="menuitem" tabIndex={-1} disabled={disabled || (!account.local && (!account.ready || account.conflict || account.remoteChanged))} onClick={() => { account.importBackup(); close(true) }}><Upload size={16} />匯入完整備份</button>
      {!account.local && <button role="menuitem" tabIndex={-1} disabled={disabled || !account.ready} onClick={() => void action(account.downloadExcel)}><FileSpreadsheet size={16} />雲端 Excel</button>}
      {(account.conflict || account.remoteChanged) && <button role="menuitem" tabIndex={-1} disabled={disabled} onClick={() => void action(account.loadCloud)}><RefreshCw size={16} />備份本機並載入雲端</button>}
      {account.conflict && <button role="menuitem" tabIndex={-1} disabled={disabled} onClick={() => void action(account.keepLocal)}><Upload size={16} />保留本機版本</button>}
      {!account.local && <><div className="account-menu-divider" role="separator" /><button role="menuitem" tabIndex={-1} onClick={() => { close(); setSettings('password') }}><KeyRound size={16} />修改密碼</button><button role="menuitem" tabIndex={-1} disabled={disabled} onClick={() => void action(account.signOut)}><LogOut size={16} />登出</button></>}
    </div>}
    {settings && createPortal(<AccountSettings mode={settings} user={user} name={name} avatar={avatar} local={local} onLocalChange={setLocal} onClose={() => { setSettings(null); requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true })) }} />, document.body)}
  </div>
}

function AccountSettings({ mode, user, name, avatar, local, onLocalChange, onClose }: {
  mode: 'profile' | 'password'; user: User | null; name: string; avatar: string; local: LocalProfile; onLocalChange: (profile: LocalProfile) => void; onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [draftName, setDraftName] = useState(name === '我的帳號' ? '' : name)
  const [preview, setPreview] = useState(avatar)
  const [change, setChange] = useState<AvatarChange>({ kind: 'keep' })
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const google = googleAvatar(user)
  useEffect(() => { dialog.current?.showModal() }, [])
  async function chooseFile(file: File) {
    setError(''); setSaved(false); setBusy(true)
    try { const blob = await prepareAvatar(file); setPreview(await blobDataUrl(blob)); setChange({ kind: 'upload', blob }) }
    catch (reason) { setError(reason instanceof Error ? reason.message : '無法讀取圖片') }
    finally { setBusy(false) }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setError(''); setBusy(true); setSaved(false)
    try {
      if (mode === 'password') {
        if (password !== confirmation) throw new Error('兩次密碼不一致')
        const { error } = await cloud!.auth.updateUser({ password })
        if (error) throw new Error('密碼未更新，請重試；若系統要求驗證，請重新登入後再操作')
        setPassword(''); setConfirmation(''); setSaved(true)
      } else {
        if (user) await saveCloudProfile(user, draftName, change)
        else {
          const next = { name: draftName.trim().slice(0, 80), avatar: change.kind === 'upload' ? preview : change.kind === 'remove' ? '' : local.avatar }
          localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(next)); onLocalChange(next)
        }
        onClose()
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : '設定未儲存，請重試') }
    finally { setBusy(false) }
  }
  return <dialog ref={dialog} className="account-settings" aria-labelledby="account-settings-title" onCancel={event => { event.preventDefault(); if (!busy) onClose() }} onClick={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <header><h2 id="account-settings-title">{mode === 'profile' ? '設定' : '修改密碼'}</h2><button className="wb-icon-button" aria-label="關閉設定" disabled={busy} onClick={onClose}><X size={18} /></button></header>
    <form onSubmit={event => void save(event)}>
      {mode === 'profile' ? <>
        <div className="account-photo-editor"><Avatar src={preview} name={draftName || '我的帳號'} large /><div><button type="button" className="wb-button" disabled={busy} onClick={() => fileInput.current?.click()}><Upload size={14} />上傳頭像</button><p>JPG、PNG 或 WebP，最大 10 MB</p></div></div>
        <input ref={fileInput} hidden type="file" accept="image/jpeg,image/png,image/webp" aria-label="選擇頭像圖片" onChange={event => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void chooseFile(file) }} />
        <div className="account-photo-actions">{google && <button type="button" disabled={busy} onClick={() => { setPreview(google); setChange({ kind: 'google' }) }}>使用 Google 頭像</button>}{preview && <button type="button" disabled={busy} onClick={() => { setPreview(''); setChange({ kind: 'remove' }) }}>移除頭像</button>}</div>
        <label>顯示名稱<input autoComplete="nickname" maxLength={80} value={draftName} disabled={busy} placeholder="你的名稱" onChange={event => setDraftName(event.target.value)} /></label>
        {user?.email && <div className="account-settings-email"><span>Email</span><p>{user.email}</p></div>}
      </> : <><label>新密碼<input type="password" autoComplete="new-password" minLength={12} required disabled={busy} value={password} onChange={event => { setPassword(event.target.value); setSaved(false) }} /></label><p className="account-settings-hint">至少 12 個字元</p><label>確認新密碼<input type="password" autoComplete="new-password" minLength={12} required disabled={busy} value={confirmation} onChange={event => { setConfirmation(event.target.value); setSaved(false) }} /></label></>}
      {error && <p className="account-settings-error" role="alert">{error}</p>}
      {saved && <p className="account-settings-success" role="status">密碼已更新</p>}
      <footer><button className="wb-button" type="button" disabled={busy} onClick={onClose}>{saved ? '關閉' : '取消'}</button><button className="wb-button primary" type="submit" disabled={busy || saved}>{busy && <LoaderCircle size={14} className="account-spinning" />}{busy ? '儲存中…' : '儲存'}</button></footer>
    </form>
  </dialog>
}
