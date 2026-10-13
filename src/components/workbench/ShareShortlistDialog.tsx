import { useEffect, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, Link2, LoaderCircle, X } from 'lucide-react'
import { cloud } from '../../lib/cloudClient'
import { createSharedShortlist, shareUrl, type ShareSettings } from '../../lib/sharedShortlist'
import type { ProgramView, SchoolSelectionState } from '../../types'

export function ShareShortlistDialog({ programs, selection, onClose }: { programs: ProgramView[]; selection: SchoolSelectionState; onClose: () => void }) {
  const [settings, setSettings] = useState<ShareSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [requireLogin, setRequireLogin] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  useEffect(() => {
    let cancelled = false
    if (!cloud) { setLoading(false); return }
    void cloud.from('easier_shortlist_shares').select('token,enabled,require_login,published_at').maybeSingle().then(({ data, error }) => {
      if (cancelled) return
      if (error) { setError('無法讀取分享設定，請關閉後重試'); setLoadFailed(true) }
      else { setSettings(data); setRequireLogin(data?.require_login ?? false) }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])
  async function configure(enabled: boolean, rotate = false) {
    if (!cloud || busy) return
    setBusy(true); setError(''); setCopied(false)
    try {
      const { data, error } = await cloud.rpc('configure_easier_share', {
        share_enabled: enabled, login_required: requireLogin,
        next_shortlist: enabled ? createSharedShortlist(programs, selection) : null, rotate_token: rotate,
      })
      if (error) throw error
      setSettings(data as ShareSettings)
    } catch { setError('分享設定未儲存，請重試') }
    finally { setBusy(false) }
  }
  const url = settings?.enabled ? shareUrl(settings.token) : ''
  return <dialog ref={dialog} className="wb-share-dialog" aria-labelledby="share-dialog-title" onCancel={event => { event.preventDefault(); if (!busy) onClose() }} onClick={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <header><h2 id="share-dialog-title"><Link2 size={18} />分享選校結果</h2><button className="wb-icon-button" disabled={busy} aria-label="關閉分享設定" onClick={onClose}><X size={18} /></button></header>
    <p className="wb-muted">僅分享彩票、衝刺、主申、較為保險與學程資訊；不含筆記和文件。</p>
    {!cloud ? <p>請在已連接雲端的工作區分享。</p> : loading ? <p>正在讀取…</p> : <>
      <div className="wb-share-state"><strong>{settings?.enabled ? '連結分享已開啟' : '私人 · 尚未分享'}</strong><span className="wb-badge">唯讀</span></div>
      <label className="wb-field-label">誰可以查看<select aria-label="分享連結的存取權" disabled={busy} value={requireLogin ? 'signed-in' : 'anyone'} onChange={event => setRequireLogin(event.target.value === 'signed-in')}><option value="anyone">持有連結的任何人</option><option value="signed-in">持有連結且已登入的使用者</option></select></label>
      {settings?.enabled && <><label className="wb-field-label">分享連結<input aria-label="選校結果分享連結" readOnly value={url} onFocus={event => event.target.select()} /></label><div className="wb-actions"><button className="wb-button" onClick={() => { void navigator.clipboard.writeText(url).then(() => setCopied(true)).catch(() => setError('無法自動複製，請選取上方連結複製')) }}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? '已複製' : '複製連結'}</button><a className="wb-button" href={url} target="_blank" rel="noreferrer">預覽<ExternalLink size={14} /></a></div><p className="wb-input-hint">修改選校結果並同步後，連結內容會自動更新。</p></>}
      <footer className="wb-actions"><button className="wb-button primary" disabled={busy || loadFailed} onClick={() => void configure(true)}>{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Link2 size={15} />}{settings?.enabled ? '更新分享設定' : '開啟連結分享'}</button>{settings?.enabled && <><button className="wb-button" disabled={busy} onClick={() => void configure(false)}>停止分享</button><button className="wb-text-button" disabled={busy} onClick={() => { if (window.confirm('產生新連結後，舊連結將立即失效。要繼續嗎？')) void configure(true, true) }}>更換連結</button></>}</footer>
    </>}
    {error && <p className="wb-notice error" role="alert">{error}</p>}
  </dialog>
}
