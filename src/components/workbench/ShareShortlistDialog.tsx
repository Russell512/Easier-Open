import { useEffect, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, Link2, LoaderCircle, X } from 'lucide-react'
import { captureShortlistSharing } from '../../lib/sharing'
import { currentAccountGuard } from '../../lib/accountSession'
import { useWorkspaceAccount } from '../../lib/workspaceAccount'
import { createSharedShortlist, shareUrl, type ShareSettings } from '../../lib/sharedShortlist'
import type { ProgramView, SchoolSelectionState } from '../../types'

export function ShareShortlistDialog({ programs, selection, onClose }: { programs: ProgramView[]; selection: SchoolSelectionState; onClose: () => void }) {
  const account = useWorkspaceAccount()
  const [ownerId] = useState(() => account?.user?.id ?? null)
  const accountGuard = currentAccountGuard()
  const connected = !!ownerId && account?.user?.id === ownerId && account.ready && !account.local
    && !!accountGuard && accountGuard.userId === ownerId && !accountGuard.signal.aborted
  const [settings, setSettings] = useState<ShareSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [requireLogin, setRequireLogin] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const lifecycle = useRef<{ active: boolean } | null>(null)
  const configuring = useRef(false)
  useEffect(() => { dialog.current?.showModal() }, [])
  useEffect(() => {
    const current = { active: true }
    lifecycle.current = current
    const guard = accountGuard
    const canUpdate = () => current.active && currentAccountGuard() === guard && !guard?.signal.aborted
    if (!connected || !ownerId) {
      setLoading(false); setBusy(false); setSettings(null); setCopied(false); setError('')
      return () => { current.active = false }
    }
    setLoading(true); setLoadFailed(false); setError('')
    void (async () => {
      try {
        const sharing = await captureShortlistSharing(ownerId)
        if (!canUpdate()) return
        sharing.assert()
        const data = await sharing.read()
        if (!canUpdate()) return
        sharing.assert()
        setSettings(data); setRequireLogin(data?.require_login ?? false)
      } catch {
        if (canUpdate()) { setError('無法讀取分享設定，請關閉後重試'); setLoadFailed(true) }
      } finally { if (canUpdate()) setLoading(false) }
    })()
    return () => { current.active = false }
  }, [connected, ownerId, accountGuard])
  async function configure(enabled: boolean, rotate = false) {
    const current = lifecycle.current
    if (!connected || !ownerId || !current?.active || configuring.current) return
    const guard = currentAccountGuard()
    const canUpdate = () => current.active && currentAccountGuard() === guard && !guard?.signal.aborted
    const userId = ownerId
    const configuration = {
      enabled, requireLogin, rotate,
      shortlist: enabled ? createSharedShortlist(programs, selection) : null,
    }
    configuring.current = true
    setBusy(true); setError(''); setCopied(false)
    try {
      const sharing = await captureShortlistSharing(userId)
      if (!canUpdate()) return
      sharing.assert()
      const data = await sharing.configure(configuration)
      if (!canUpdate()) return
      sharing.assert()
      setSettings(data)
    } catch { if (canUpdate()) setError('分享設定未儲存，請關閉後確認登入帳號再重試') }
    finally {
      configuring.current = false
      if (canUpdate()) setBusy(false)
    }
  }
  async function copyLink(url: string) {
    const current = lifecycle.current
    const guard = currentAccountGuard()
    if (!connected || !current?.active || !guard || guard.userId !== ownerId || guard.signal.aborted) return
    const canUpdate = () => current.active && currentAccountGuard() === guard && !guard.signal.aborted
    try { await navigator.clipboard.writeText(url); if (canUpdate()) setCopied(true) }
    catch { if (canUpdate()) setError('無法自動複製，請選取上方連結複製') }
  }
  const url = settings?.enabled ? shareUrl(settings.token) : ''
  return <dialog ref={dialog} className="wb-share-dialog" aria-labelledby="share-dialog-title" onCancel={event => { event.preventDefault(); if (!busy) onClose() }} onClick={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <header><h2 id="share-dialog-title"><Link2 size={18} />分享選校結果</h2><button className="wb-icon-button" disabled={busy} aria-label="關閉分享設定" onClick={onClose}><X size={18} /></button></header>
    <p className="wb-muted">僅分享彩票、衝刺、主申、較為保險與學程資訊；不含筆記和文件。</p>
    {!connected ? <p>請在已登入並載入完成的工作區重新開啟分享。</p> : loading ? <p>正在讀取…</p> : <>
      <div className="wb-share-state"><strong>{settings?.enabled ? '連結分享已開啟' : '私人 · 尚未分享'}</strong><span className="wb-badge">唯讀</span></div>
      <label className="wb-field-label">誰可以查看<select aria-label="分享連結的存取權" disabled={busy} value={requireLogin ? 'signed-in' : 'anyone'} onChange={event => setRequireLogin(event.target.value === 'signed-in')}><option value="anyone">持有連結的任何人</option><option value="signed-in">持有連結且已登入的使用者</option></select></label>
      {settings?.enabled && <><label className="wb-field-label">分享連結<input aria-label="選校結果分享連結" readOnly value={url} onFocus={event => event.target.select()} /></label><div className="wb-actions"><button className="wb-button" onClick={() => { void copyLink(url) }}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? '已複製' : '複製連結'}</button><a className="wb-button" href={url} target="_blank" rel="noreferrer">預覽<ExternalLink size={14} /></a></div><p className="wb-input-hint">修改選校結果並同步後，連結內容會自動更新。</p></>}
      <footer className="wb-actions"><button className="wb-button primary" disabled={busy || loadFailed} onClick={() => void configure(true)}>{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Link2 size={15} />}{settings?.enabled ? '更新分享設定' : '開啟連結分享'}</button>{settings?.enabled && <><button className="wb-button" disabled={busy} onClick={() => void configure(false)}>停止分享</button><button className="wb-text-button" disabled={busy} onClick={() => { if (window.confirm('產生新連結後，舊連結將立即失效。要繼續嗎？')) void configure(true, true) }}>更換連結</button></>}</footer>
    </>}
    {error && <p className="wb-notice error" role="alert">{error}</p>}
  </dialog>
}
