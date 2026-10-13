import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { cloud, LOCAL_MODE, LOCAL_CHANGE_EVENT } from '../lib/cloudClient'
import { addExcelExport, applySnapshot, captureSnapshot, downloadCloudExcel, exportFullBackup, importFullBackup, needsConflictResolution, pushCloud, readBaseline, readCloud, snapshotSignature, writeBaseline, type Baseline } from '../lib/cloudSnapshot'
import { STORAGE_KEY } from '../lib/workbook'
import { createSyncQueue } from '../lib/syncQueue'
import { signInWithGoogle } from '../lib/googleAuth'
import './cloud.css'

export function CloudWorkspace({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(!cloud)
  const [ready, setReady] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [status, setStatus] = useState('正在讀取雲端資料…')
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [remoteChanged, setRemoteChanged] = useState(false)
  const baseline = useRef<Baseline | null>(null)
  const working = useRef(false)
  const blocked = useRef(false)
  const dirty = useRef(false)
  const uid = session?.user.id
  const backupInput = useRef<HTMLInputElement>(null)
  const [editor, setEditor] = useState(false)
  const [access, setAccess] = useState<{ userId: string; allowed: boolean } | null>(null)
  const canEdit = !!uid && access?.userId === uid && access.allowed

  useEffect(() => {
    if (!uid || !cloud) return
    let cancelled = false
    void cloud.rpc('easier_can_edit_workspace').then(({ data, error }) => {
      if (cancelled) return
      if (error) { setError('無法確認工作區權限，請稍後重試'); return }
      setAccess({ userId: uid, allowed: data === true })
    })
    return () => { cancelled = true }
  }, [uid])

  useEffect(() => {
    if (!uid || !canEdit) return
    let release: (() => void) | undefined
    let cancelled = false
    if (!navigator.locks) { setEditor(true); return }
    void navigator.locks.request('easier-workspace-editor', { ifAvailable: true }, async (lock) => {
      if (cancelled) return
      if (!lock) { setError('另一個分頁正在編輯這個工作區，請關閉該分頁後重試。'); return }
      setEditor(true)
      await new Promise<void>((resolve) => { release = resolve })
    })
    return () => { cancelled = true; release?.(); setEditor(false) }
  }, [uid, canEdit])

  useEffect(() => {
    if (!cloud) return
    void cloud.auth.getSession().then(({ data, error }) => { setSession(data.session); setAuthReady(true); if (error) setError(error.message) })
    const { data } = cloud.auth.onAuthStateChange((_event, next) => { setSession(next); setAuthReady(true) })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!uid || !canEdit || !editor) return
    let cancelled = false
    setReady(false); blocked.current = false; setConflict(false); setError('')
    async function initialize() {
      try {
        const local = await captureSnapshot(uid!)
        const localSignature = await snapshotSignature(local.snapshot)
        const saved = await readBaseline()
        const remote = await readCloud(uid!)
        const remoteSignature = remote ? await snapshotSignature(remote.payload) : null
        if (cancelled) return
        const hasLocal = !!local.snapshot.values[STORAGE_KEY] || local.snapshot.documents.length > 0 || Object.keys(local.snapshot.values).length > 0
        const localDirty = saved ? localSignature !== saved.signature : hasLocal
        if (needsConflictResolution(saved, uid!, localSignature, remote ? { revision: remote.revision, signature: remoteSignature! } : null, hasLocal)) {
          blocked.current = true; setConflict(true); setStatus('本機和雲端有不同版本，請先備份本機資料'); return
        }
        const alreadySynced = !!remote && localSignature === remoteSignature
        if (remote && alreadySynced) {
          baseline.current = { userId: uid!, revision: remote.revision, signature: localSignature }
        } else if (remote && !localDirty) {
          await applySnapshot(remote.payload, uid!)
          const restored = await captureSnapshot(uid!)
          baseline.current = { userId: uid!, revision: remote.revision, signature: await snapshotSignature(restored.snapshot) }
        } else {
          baseline.current = { userId: uid!, revision: remote?.revision ?? 0, signature: remote ? saved!.signature : '' }
        }
        writeBaseline(baseline.current)
        dirty.current = !alreadySynced && (localDirty || !remote)
        if (!cancelled) { setReady(true); setStatus(dirty.current ? '等待上傳…' : '已同步') }
      } catch (reason) { if (!cancelled) setError(reason instanceof Error ? reason.message : '無法載入雲端') }
    }
    void initialize()
    return () => { cancelled = true }
  }, [uid, canEdit, editor])

  const syncPass = useCallback(async () => {
    if (!uid || !canEdit || !ready || blocked.current || !baseline.current || baseline.current.userId !== uid) return false
    working.current = true
    try {
      const { snapshot, files } = await captureSnapshot(uid)
      if (!snapshot.values[STORAGE_KEY]) return false
      const signature = await snapshotSignature(snapshot)
      if (signature === baseline.current.signature) { dirty.current = false; setError(''); setStatus('已同步'); return false }
      dirty.current = true; setStatus('正在上傳…'); setError('')
      await addExcelExport(uid, snapshot, files)
      const revision = await pushCloud(snapshot, files, baseline.current.revision)
      baseline.current = { userId: uid, revision, signature }
      writeBaseline(baseline.current)
      // Drain edits made during the request immediately instead of waiting for a retry timer.
      const latest = await captureSnapshot(uid)
      dirty.current = await snapshotSignature(latest.snapshot) !== signature
      setStatus(dirty.current ? '等待上傳…' : `已同步 · ${new Date().toLocaleTimeString('zh-TW')}`)
      return dirty.current
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '同步失敗'
      if (message === 'SYNC_CONFLICT') { blocked.current = true; setConflict(true); setStatus('版本衝突：本機修改已保留') }
      else { setError(message); setStatus('尚未同步，資料仍保存在本機') }
      return false
    } finally { working.current = false }
  }, [uid, canEdit, ready])
  const syncQueue = useMemo(() => createSyncQueue(syncPass), [syncPass])
  const sync = syncQueue.request

  useEffect(() => {
    if (!ready || !canEdit) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const flush = () => { clearTimeout(timer); timer = undefined; void sync() }
    const changed = () => {
      dirty.current = true
      if (blocked.current) { setConflict(true); setRemoteChanged(false); setStatus('版本衝突：本機修改已保留'); return }
      if (!working.current) setStatus('等待上傳…')
      // Bound the wait even when the user keeps typing; changes during uploads are queued.
      if (timer === undefined) timer = setTimeout(flush, 500)
    }
    const online = () => { changed(); flush() }
    const visibilityChanged = () => { if (dirty.current) flush() }
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty.current || working.current) { event.preventDefault(); event.returnValue = '' } }
    const interval = setInterval(() => void sync(), 10_000)
    window.addEventListener(LOCAL_CHANGE_EVENT, changed)
    window.addEventListener('online', online)
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', visibilityChanged)
    window.addEventListener('beforeunload', beforeUnload)
    changed()
    return () => { clearTimeout(timer); clearInterval(interval); window.removeEventListener(LOCAL_CHANGE_EVENT, changed); window.removeEventListener('online', online); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', visibilityChanged); window.removeEventListener('beforeunload', beforeUnload) }
  }, [ready, canEdit, sync])

  useEffect(() => {
    if (!uid || !canEdit || !ready) return
    const interval = setInterval(async () => {
      if (working.current || blocked.current) return
      try {
        const remote = await readCloud(uid)
        if (!working.current && remote && remote.revision > (baseline.current?.revision ?? 0)) {
          blocked.current = true
          const local = await captureSnapshot(uid)
          if (await snapshotSignature(local.snapshot) !== baseline.current?.signature) { setConflict(true); setStatus('版本衝突：本機修改已保留') }
          else { setRemoteChanged(true); setStatus('其他裝置已更新，請載入最新資料') }
        }
      } catch { /* The next save reports connectivity errors; do not erase local data. */ }
    }, 20_000)
    return () => clearInterval(interval)
  }, [uid, canEdit, ready])

  async function loadCloudVersion() {
    if (!uid) return
    if (!window.confirm('先下載本機完整備份，再載入雲端版本。未送出的表單內容請先儲存。要繼續嗎？')) return
    setBusy(true)
    try {
      await exportFullBackup()
      const remote = await readCloud(uid)
      if (!remote) throw new Error('此帳號尚無雲端資料，請先使用原帳號完成同步')
      await applySnapshot(remote.payload, uid)
      const local = await captureSnapshot(uid)
      writeBaseline({ userId: uid, revision: remote.revision, signature: await snapshotSignature(local.snapshot) })
      dirty.current = false; window.location.reload()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '載入失敗') }
    finally { setBusy(false) }
  }
  async function keepLocalVersion() {
    const saved = await readBaseline()
    if (!uid || (saved && saved.userId !== uid)) { setError('不同帳號的資料必須先匯出，再登入正確帳號匯入'); return }
    if (!window.confirm('以本機版本更新雲端？系統會先下載本機備份，並在雲端保留前一版本。')) return
    setBusy(true)
    try {
      await exportFullBackup()
      const remote = await readCloud(uid)
      const { snapshot, files } = await captureSnapshot(uid)
      if (!snapshot.values[STORAGE_KEY]) throw new Error('本機尚無完整學校資料')
      await addExcelExport(uid, snapshot, files)
      const revision = await pushCloud(snapshot, files, remote?.revision ?? 0)
      writeBaseline({ userId: uid, revision, signature: await snapshotSignature(snapshot) })
      dirty.current = false; window.location.reload()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '同步失敗') }
    finally { setBusy(false) }
  }
  async function restoreBackup(file: File) {
    if (!window.confirm('匯入完整備份將更新目前工作區，並在同步後更新雲端。要先備份目前資料並繼續嗎？')) return
    setBusy(true); blocked.current = true
    try { await exportFullBackup(); await importFullBackup(file); dirty.current = false; window.location.reload() }
    catch (reason) { blocked.current = false; setError(reason instanceof Error ? reason.message : '匯入失敗') }
    finally { setBusy(false) }
  }
  const backupChooser = <input ref={backupInput} type="file" accept=".json" hidden onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void restoreBackup(file) }} />

  async function signIn(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try { const { error } = await cloud!.auth.signInWithPassword({ email, password }); if (error) throw error; setPassword('') }
    catch (reason) { setError(reason instanceof Error ? reason.message : '登入失敗') }
    finally { setBusy(false) }
  }
  async function run(action: () => Promise<void>) { setError(''); try { await action() } catch (reason) { setError(reason instanceof Error ? reason.message : '操作失敗') } }

  if (!cloud) {
    if (import.meta.env.PROD && !LOCAL_MODE) return <div className="cloud-screen"><h1>雲端設定尚未完成</h1><p>請設定 Supabase 連線後重新部署。</p></div>
    return <><div className="cloud-bar">本機模式 · 尚未連接雲端 <button onClick={() => void run(exportFullBackup)}>下載完整搬移備份</button><button onClick={() => backupInput.current?.click()}>匯入完整備份</button></div>{error && <div className="cloud-error">{error}</div>}{backupChooser}{children}</>
  }
  if (!authReady) return <div className="cloud-screen">正在確認登入狀態…</div>
  if (!session) return <main className="cloud-screen"><form onSubmit={(event) => void signIn(event)}><p className="cloud-brand">EASIER</p><h1>登入工作區</h1><button type="button" className="cloud-google" disabled={busy} onClick={() => { setBusy(true); void run(signInWithGoogle).finally(() => setBusy(false)) }}>使用 Google 帳號登入</button><div className="cloud-login-divider">或使用 Email</div><label>Email<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>密碼<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label><button disabled={busy} type="submit">{busy ? '正在登入…' : '登入工作區'}</button>{error && <p role="alert">{error}</p>}<a href="/privacy.html">隱私權說明</a></form></main>
  if (!access || access.userId !== uid) return <main className="cloud-screen"><h1>{error ? '無法確認權限' : '正在確認權限…'}</h1>{error && <><p role="alert">{error}</p><button onClick={() => window.location.reload()}>重試</button></>}<button onClick={() => void cloud!.auth.signOut()}>登出</button></main>
  if (!canEdit) return <main className="cloud-screen"><div className="cloud-viewer"><p className="cloud-brand">EASIER · 唯讀帳號</p><h1>請使用分享連結</h1><p>此帳號沒有編輯權限。透過擁有者提供的連結，可以查看已分享的選校結果。</p><p>{session.user.email}</p><button onClick={() => void cloud!.auth.signOut()}>登出並切換帳號</button></div></main>
  return <>
    <div className="cloud-bar" role="status"><span>自動同步已開啟 · {status}</span><span className="cloud-account">{session.user.email}</span>
      {ready && !conflict && !remoteChanged && <button onClick={() => void sync()}>立即同步</button>}
      {(conflict || remoteChanged) && <button disabled={busy} onClick={() => void loadCloudVersion()}>備份本機並載入雲端</button>}
      <button onClick={() => void run(exportFullBackup)}>完整備份</button>
      {conflict && <button disabled={busy} onClick={() => void keepLocalVersion()}>保留本機版本</button>}
      {ready && !conflict && !remoteChanged && <button disabled={busy} onClick={() => backupInput.current?.click()}>匯入完整備份</button>}
      <button onClick={() => setChangingPassword((value) => !value)}>修改密碼</button>
      {ready && <button onClick={() => void run(() => downloadCloudExcel(uid!))}>雲端 Excel</button>}
      <button onClick={() => void run(async () => {
        await sync()
        if (dirty.current || working.current || blocked.current) throw new Error('請先完成同步或處理版本衝突，再登出')
        await cloud!.auth.signOut(); setReady(false)
      })}>登出</button>
    </div>
    {error && <div className="cloud-error" role="alert">{error} <button onClick={() => ready ? void sync() : window.location.reload()}>重試</button></div>}
    {changingPassword && <form className="cloud-password" onSubmit={(event) => { event.preventDefault(); void run(async () => { setBusy(true); try { const { error } = await cloud!.auth.updateUser({ password: newPassword }); if (error) throw error; setNewPassword(''); setChangingPassword(false); setStatus('密碼已更新') } finally { setBusy(false) } }) }}><label>新密碼（至少 12 個字元）<input type="password" autoComplete="new-password" minLength={12} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label><button disabled={busy} type="submit">儲存新密碼</button><button type="button" onClick={() => { setChangingPassword(false); setNewPassword('') }}>取消</button></form>}
    {backupChooser}
    {ready ? <div inert={busy}>{children}</div> : <div className="cloud-screen"><h1>{conflict ? '保留你的本機修改' : '正在準備工作區'}</h1><p>{conflict ? '先下載完整備份，再使用上方按鈕載入雲端。原有修改不會自動覆蓋。' : '讀取雲端資料與文件中…'}</p></div>}
  </>
}
