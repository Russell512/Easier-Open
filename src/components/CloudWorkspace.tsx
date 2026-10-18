import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { cloud, LOCAL_MODE, LOCAL_CHANGE_EVENT } from '../lib/cloudClient'
import { addExcelExport, applySnapshot, captureSnapshot, downloadCloudExcel, exportFullBackup, importFullBackup, needsConflictResolution, pushCloud, readBaseline, readCloud, resetCloudSnapshotCaches, snapshotSignature, writeBaseline, type Baseline } from '../lib/cloudSnapshot'
import { STORAGE_KEY } from '../lib/workbook'
import { createSyncQueue } from '../lib/syncQueue'
import { oauthCallbackError, oauthRedirectUrl, signInWithProvider, type OAuthProvider } from '../lib/oauthAuth'
import { activateAccountBank, ACTIVE_ACCOUNT_KEY, ACCOUNT_SWITCH_KEY, preserveActiveAccount } from '../lib/accountCache'
import { bindAccountGuard, createAccountGuard, type AccountGuard } from '../lib/accountSession'
import { createAccountCloud, type AccountCloud } from '../lib/accountCloud'
import { WorkspaceAccountContext, type WorkspaceAccount } from '../lib/workspaceAccount'
import { AccountMenu } from './AccountMenu'
import { OAuthButtons } from './OAuthButtons'
import './cloud.css'

const EMAIL_SIGNUP_ENABLED = import.meta.env.VITE_EMAIL_SIGNUP_ENABLED === 'true'

export function CloudWorkspace({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(!cloud)
  const [ready, setReady] = useState(false)
  const [bankUserId, setBankUserId] = useState<string | null>(null)
  const [quarantined, setQuarantined] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('正在讀取雲端資料…')
  const [error, setError] = useState(() => oauthCallbackError(window.location))
  const [conflict, setConflict] = useState(false)
  const [remoteChanged, setRemoteChanged] = useState(false)
  const baseline = useRef<Baseline | null>(null)
  const working = useRef(false)
  const blocked = useRef(false)
  const dirty = useRef(false)
  const guard = useRef<AccountGuard | null>(null)
  const scopedCloud = useRef<AccountCloud | null>(null)
  const latestSession = useRef<Session | null>(null)
  const uid = session?.user.id
  const backupInput = useRef<HTMLInputElement>(null)
  const [editor, setEditor] = useState(false)
  const [access, setAccess] = useState<{ userId: string; allowed: boolean } | null>(null)
  const canEdit = !!uid && access?.userId === uid && access.allowed
  const ownBankReady = !!uid && bankUserId === uid
  const workspaceReady = ready && ownBankReady
  const requestContext = useCallback(() => {
    const context = scopedCloud.current
    if (!context || context.userId !== uid) throw new Error('帳號正在切換，請稍後重試。')
    context.assert()
    return context
  }, [uid])
  function assertOwnBank() {
    requestContext()
    if (!ownBankReady || localStorage.getItem(ACTIVE_ACCOUNT_KEY) !== uid || localStorage.getItem(ACCOUNT_SWITCH_KEY)) throw new Error('你的工作區尚未載入完成，請稍後重試。')
  }

  useEffect(() => {
    if (!uid || !cloud) return
    let cancelled = false
    const context = requestContext()
    void (async () => {
      try {
        const { data, error } = await context.client.rpc('easier_ensure_workspace_access')
        context.assert()
        if (cancelled) return
        if (error || data !== true) throw new Error('無法建立你的工作區，請稍後重試。')
        setAccess({ userId: uid, allowed: true })
      } catch (reason) { if (!cancelled && !guard.current?.signal.aborted) setError(reason instanceof Error ? reason.message : '無法建立工作區。') }
    })()
    return () => { cancelled = true }
  }, [uid, requestContext])

  useEffect(() => {
    if (!uid || !canEdit) return
    let release: (() => void) | undefined
    let cancelled = false
    if (!navigator.locks) { setError('此瀏覽器無法安全切換帳號資料，請更新瀏覽器後重試。'); return }
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
    let cancelled = false
    let observedIdentity: string | null | undefined
    function acceptSession(next: Session | null) {
      if (cancelled) return
      const nextId = next?.user.id ?? null
      const previousId = observedIdentity === undefined ? guard.current?.userId : observedIdentity
      if (previousId !== undefined && previousId !== nextId) {
        // Stop old promises synchronously. A fresh document prevents old component
        // closures from ever writing into the next account's active local bank.
        guard.current?.invalidate()
        // Local edits are durable and the next page archives them before switching.
        // Do not let the autosync unload prompt interrupt this required reload.
        dirty.current = false; working.current = false
        setReady(false); setBankUserId(null); setSession(null)
        window.location.reload()
        return
      }
      observedIdentity = nextId
      if (next) {
        if (!guard.current) { guard.current = createAccountGuard(next.user.id); bindAccountGuard(guard.current) }
        scopedCloud.current = createAccountCloud(next, guard.current)
      }
      latestSession.current = next
      setSession(next); setAuthReady(true)
    }
    void cloud.auth.getSession().then(({ data, error }) => {
      if (cancelled || observedIdentity !== undefined) return
      acceptSession(data.session)
      if (error) setError(error.message)
    })
    const { data } = cloud.auth.onAuthStateChange((_event, next) => acceptSession(next))
    const profileUpdated = (event: Event) => {
      const user = (event as CustomEvent<User>).detail
      if (!user || guard.current?.signal.aborted || user.id !== latestSession.current?.user.id) return
      latestSession.current = { ...latestSession.current, user }
      setSession(previous => previous?.user.id === user.id ? { ...previous, user } : previous)
    }
    window.addEventListener('easier-account-profile-updated', profileUpdated)
    return () => { cancelled = true; data.subscription.unsubscribe(); window.removeEventListener('easier-account-profile-updated', profileUpdated) }
  }, [])

  useEffect(() => {
    if (!uid || !canEdit || !editor) return
    let cancelled = false
    setReady(false); blocked.current = false; setConflict(false); setError('')
    async function initialize() {
      try {
        const context = requestContext()
        const activated = await activateAccountBank(uid!, guard.current!)
        context.assert()
        if (cancelled) return
        setBankUserId(uid!); setQuarantined(activated.quarantined)
        resetCloudSnapshotCaches()
        if (activated.switched) window.history.replaceState(null, '', window.location.pathname + window.location.search)
        const local = await captureSnapshot(uid!)
        const localSignature = await snapshotSignature(local.snapshot)
        const saved = await readBaseline()
        const remote = await readCloud(uid!, context)
        const remoteSignature = remote ? await snapshotSignature(remote.payload) : null
        context.assert()
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
          await applySnapshot(remote.payload, uid!, context)
          const restored = await captureSnapshot(uid!)
          baseline.current = { userId: uid!, revision: remote.revision, signature: await snapshotSignature(restored.snapshot) }
        } else {
          baseline.current = { userId: uid!, revision: remote?.revision ?? 0, signature: remote ? saved!.signature : '' }
        }
        context.assert()
        if (cancelled) return
        writeBaseline(baseline.current)
        dirty.current = !alreadySynced && (localDirty || !remote)
        if (!cancelled) { setReady(true); setStatus(dirty.current ? '等待上傳…' : '已同步') }
      } catch (reason) { if (!cancelled && !guard.current?.signal.aborted) setError(reason instanceof Error ? reason.message : '無法載入雲端') }
    }
    void initialize()
    return () => { cancelled = true }
  }, [uid, canEdit, editor, requestContext])

  const syncPass = useCallback(async () => {
    if (!uid || !canEdit || !workspaceReady || blocked.current || !baseline.current || baseline.current.userId !== uid || guard.current?.signal.aborted) return false
    working.current = true
    try {
      const context = requestContext()
      const { snapshot, files } = await captureSnapshot(uid)
      if (!snapshot.values[STORAGE_KEY]) return false
      const signature = await snapshotSignature(snapshot)
      context.assert()
      if (signature === baseline.current.signature) { dirty.current = false; setError(''); setStatus('已同步'); return false }
      dirty.current = true; setStatus('正在上傳…'); setError('')
      await addExcelExport(uid, snapshot, files)
      const revision = await pushCloud(snapshot, files, baseline.current.revision, context)
      context.assert()
      baseline.current = { userId: uid, revision, signature }
      writeBaseline(baseline.current)
      // Drain edits made during the request immediately instead of waiting for a retry timer.
      const latest = await captureSnapshot(uid)
      dirty.current = await snapshotSignature(latest.snapshot) !== signature
      context.assert()
      setStatus(dirty.current ? '等待上傳…' : `已同步 · ${new Date().toLocaleTimeString('zh-TW')}`)
      return dirty.current
    } catch (reason) {
      if (guard.current?.signal.aborted) return false
      const message = reason instanceof Error ? reason.message : '同步失敗'
      if (message === 'SYNC_CONFLICT') { blocked.current = true; setConflict(true); setStatus('版本衝突：本機修改已保留') }
      else { setError(message); setStatus('尚未同步，資料仍保存在本機') }
      return false
    } finally { working.current = false }
  }, [uid, canEdit, workspaceReady, requestContext])
  const syncQueue = useMemo(() => createSyncQueue(syncPass), [syncPass])
  const sync = syncQueue.request

  useEffect(() => {
    if (!workspaceReady || !canEdit) return
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
  }, [workspaceReady, canEdit, sync])

  useEffect(() => {
    if (!uid || !canEdit || !workspaceReady) return
    const interval = setInterval(async () => {
      if (working.current || blocked.current) return
      try {
        const context = requestContext()
        const remote = await readCloud(uid, context)
        if (!working.current && remote && remote.revision > (baseline.current?.revision ?? 0)) {
          blocked.current = true
          const local = await captureSnapshot(uid)
          const signature = await snapshotSignature(local.snapshot)
          context.assert()
          if (signature !== baseline.current?.signature) { setConflict(true); setStatus('版本衝突：本機修改已保留') }
          else { setRemoteChanged(true); setStatus('其他裝置已更新，請載入最新資料') }
        }
      } catch { /* The next save reports connectivity errors; do not erase local data. */ }
    }, 20_000)
    return () => clearInterval(interval)
  }, [uid, canEdit, workspaceReady, requestContext])

  async function loadCloudVersion() {
    if (!uid) return
    assertOwnBank()
    if (!window.confirm('先下載本機完整備份，再載入雲端版本。未送出的表單內容請先儲存。要繼續嗎？')) return
    setBusy(true)
    try {
      const context = requestContext()
      await exportFullBackup()
      context.assert()
      const remote = await readCloud(uid, context)
      if (!remote) throw new Error('此帳號尚無雲端資料，請先使用原帳號完成同步')
      await applySnapshot(remote.payload, uid, context)
      const local = await captureSnapshot(uid)
      writeBaseline({ userId: uid, revision: remote.revision, signature: await snapshotSignature(local.snapshot) })
      dirty.current = false; window.location.reload()
    } catch (reason) { if (!guard.current?.signal.aborted) setError(reason instanceof Error ? reason.message : '載入失敗') }
    finally { setBusy(false) }
  }
  async function keepLocalVersion() {
    assertOwnBank()
    const saved = await readBaseline()
    if (!uid || (saved && saved.userId !== uid)) { setError('不同帳號的資料必須先匯出，再登入正確帳號匯入'); return }
    if (!window.confirm('以本機版本更新雲端？系統會先下載本機備份，並在雲端保留前一版本。')) return
    setBusy(true)
    try {
      const context = requestContext()
      await exportFullBackup()
      context.assert()
      const remote = await readCloud(uid, context)
      const { snapshot, files } = await captureSnapshot(uid)
      if (!snapshot.values[STORAGE_KEY]) throw new Error('本機尚無完整學校資料')
      await addExcelExport(uid, snapshot, files)
      const revision = await pushCloud(snapshot, files, remote?.revision ?? 0, context)
      writeBaseline({ userId: uid, revision, signature: await snapshotSignature(snapshot) })
      dirty.current = false; window.location.reload()
    } catch (reason) { if (!guard.current?.signal.aborted) setError(reason instanceof Error ? reason.message : '同步失敗') }
    finally { setBusy(false) }
  }
  async function restoreBackup(file: File) {
    if (cloud) assertOwnBank()
    if (!window.confirm('匯入完整備份將更新目前工作區，並在同步後更新雲端。要先備份目前資料並繼續嗎？')) return
    setBusy(true); blocked.current = true
    try { await exportFullBackup(); await importFullBackup(file); dirty.current = false; window.location.reload() }
    catch (reason) { blocked.current = false; setError(reason instanceof Error ? reason.message : '匯入失敗') }
    finally { setBusy(false) }
  }
  const backupChooser = <input ref={backupInput} type="file" accept=".json" hidden onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void restoreBackup(file) }} />

  async function signIn(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setConfirmation('')
    try {
      if (EMAIL_SIGNUP_ENABLED && authMode === 'signup') {
        const { data, error } = await cloud!.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: oauthRedirectUrl(window.location) } })
        if (error) throw error
        setPassword('')
        if (!data.session) setConfirmation('請到信箱開啟確認信，完成驗證後即可登入你的工作區；若帳號已存在，請直接登入。')
      } else {
        const { error } = await cloud!.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
        setPassword('')
      }
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : '登入失敗') }
    finally { setBusy(false) }
  }
  async function signInWithOAuth(provider: OAuthProvider) {
    setBusy(true); setError('')
    try { await signInWithProvider(provider) }
    catch (reason) { setError(reason instanceof Error ? reason.message : '登入失敗') }
    finally { setBusy(false) }
  }
  async function run(action: () => Promise<void>) { setError(''); try { await action() } catch (reason) { if (!guard.current?.signal.aborted) setError(reason instanceof Error ? reason.message : '操作失敗') } }

  const account: WorkspaceAccount = {
    user: session?.user ?? null, local: !cloud, status, error, busy, ready: !cloud || workspaceReady, conflict: ownBankReady && conflict, remoteChanged: ownBankReady && remoteChanged,
    sync: () => run(async () => { await sync() }),
    backup: () => run(async () => { if (cloud) assertOwnBank(); await exportFullBackup() }),
    importBackup: () => { void run(async () => { if (cloud) assertOwnBank(); backupInput.current?.click() }) },
    downloadExcel: () => run(async () => { assertOwnBank(); await downloadCloudExcel(uid!, requestContext()) }),
    loadCloud: () => run(loadCloudVersion),
    keepLocal: () => run(keepLocalVersion),
    signOut: () => run(async () => {
      if (ownBankReady) {
        await sync()
        // A failed/offline cloud sync must not destroy unsynced edits on logout.
        await preserveActiveAccount(uid!, guard.current!)
      }
      guard.current?.assert()
      const { error } = await cloud!.auth.signOut()
      if (error) throw error
      setReady(false)
    }),
  }

  if (!cloud) {
    if (import.meta.env.PROD && !LOCAL_MODE) return <div className="cloud-screen"><h1>雲端設定尚未完成</h1><p>請設定 Supabase 連線後重新部署。</p></div>
    return <WorkspaceAccountContext.Provider value={account}><div className="cloud-workspace">{error && <div className="cloud-error" role="alert">{error}</div>}{backupChooser}<div className="cloud-workspace-content" inert={busy}>{children}</div></div></WorkspaceAccountContext.Provider>
  }
  if (!authReady) return <div className="cloud-screen">正在確認登入狀態…</div>
  if (!session) return <main className="cloud-screen cloud-login-screen">
    <section className="cloud-login-card" aria-labelledby="cloud-login-title">
      <header className="cloud-login-heading"><div className="cloud-login-brand"><span className="cloud-login-mark" aria-hidden="true">e</span><strong>Easier</strong></div><h1 id="cloud-login-title">{authMode === 'signup' ? '建立你的 Easier 帳號' : '登入你的工作區'}</h1><p>{authMode === 'signup' ? '每個帳號，都有獨立的學程、筆記與文件。' : '學程、筆記與申請進度，接著上次的步調。'}</p></header>
      <form className="cloud-login-form" onSubmit={(event) => void signIn(event)} aria-busy={busy}>
        <OAuthButtons busy={busy} onSignIn={provider => void signInWithOAuth(provider)} />
        <div className="cloud-login-divider"><span>或使用 Email {authMode === 'signup' ? '註冊' : '登入'}</span></div>
        <label htmlFor="cloud-email">Email<input id="cloud-email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" required disabled={busy} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label htmlFor="cloud-password">密碼<input id="cloud-password" type="password" autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} minLength={authMode === 'signup' ? 8 : undefined} placeholder={authMode === 'signup' ? '至少 8 個字元' : '輸入你的密碼'} required disabled={busy} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <button className="cloud-email-submit" disabled={busy} type="submit">{busy ? '處理中…' : authMode === 'signup' ? '建立帳號' : '登入工作區'}</button>
        {confirmation && <p className="cloud-login-confirmation" role="status">{confirmation}</p>}
        {error && <p className="cloud-login-error" role="alert">{error}</p>}
      </form>
      <footer className="cloud-login-footer">{EMAIL_SIGNUP_ENABLED ? <p>{authMode === 'signup' ? '已經有帳號？' : '第一次使用 Easier？'}<button type="button" className="cloud-auth-toggle" disabled={busy} onClick={() => { setAuthMode(authMode === 'signup' ? 'login' : 'signup'); setError(''); setConfirmation(''); setPassword('') }}>{authMode === 'signup' ? '登入' : '建立帳號'}</button></p> : <p>第一次使用？使用 Google 即可建立獨立工作區。</p>}<a href="/privacy.html">隱私權說明</a></footer>
    </section>
  </main>
  if (!access || access.userId !== uid || !canEdit) return <main className="cloud-screen"><h1>{error ? '工作區尚未準備完成' : '正在準備你的帳號…'}</h1>{error && <><p role="alert">{error}</p><button onClick={() => window.location.reload()}>重試</button></>}<button onClick={() => void cloud!.auth.signOut()}>登出</button></main>
  return <WorkspaceAccountContext.Provider value={account}><div className="cloud-workspace">
    {!workspaceReady && <header className="cloud-pending-header"><strong>Easier</strong>{ownBankReady ? <AccountMenu /> : <button onClick={() => void account.signOut()}>登出</button>}</header>}
    {ownBankReady && (conflict || remoteChanged) && <div className="cloud-notice" role="alert"><span>{status}</span><button disabled={busy} onClick={() => void account.loadCloud()}>備份本機並載入雲端</button>{conflict && <button disabled={busy} onClick={() => void account.keepLocal()}>保留本機版本</button>}</div>}
    {quarantined && <div className="cloud-notice" role="status">這個瀏覽器有無法辨識帳號的舊資料，已另存於本機隔離備份，沒有加入目前帳號。</div>}
    {error && <div className="cloud-error" role="alert">{error} <button onClick={() => ready ? void sync() : window.location.reload()}>重試</button></div>}
    {backupChooser}
    {workspaceReady ? <div key={uid} className="cloud-workspace-content" inert={busy}>{children}</div> : <div className="cloud-screen"><h1>{conflict ? '保留你的本機修改' : '正在準備工作區'}</h1><p>{conflict ? '載入雲端前會先下載完整備份。原有修改不會自動覆蓋。' : '讀取這個帳號的資料與文件中…'}</p></div>}
  </div></WorkspaceAccountContext.Provider>
}
