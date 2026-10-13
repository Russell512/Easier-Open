import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ExternalLink, Eye, Search } from 'lucide-react'
import { cloud } from '../lib/cloudClient'
import { signInWithGoogle } from '../lib/googleAuth'
import { safeWebUrl } from '../lib/documents'
import { SHORTLIST_RESULTS } from '../lib/shortlistExport'
import { requirementLabels } from '../lib/requirements'
import type { SharedShortlist } from '../lib/sharedShortlist'
import './cloud.css'
import './workbench/workbench.css'
import './sharing.css'

type SharedResponse = { status: 'ok'; shortlist: SharedShortlist; published_at: string } | { status: 'not_found' | 'login_required' }
export function SharedShortlistPage({ token }: { token: string | null }) {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(!cloud)
  const [result, setResult] = useState<SharedResponse | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!cloud) return
    void cloud.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true) })
    const { data } = cloud.auth.onAuthStateChange((_event, next) => { setSession(next); setAuthReady(true) })
    return () => data.subscription.unsubscribe()
  }, [])
  const uid = session?.user.id
  useEffect(() => {
    if (!authReady) return
    if (!cloud || !token) { setResult({ status: 'not_found' }); return }
    let cancelled = false
    let fetching = false
    setResult(null)
    async function read() {
      if (fetching) return
      fetching = true
      try {
        const { data, error } = await cloud!.rpc('read_easier_share', { share_token: token })
        if (cancelled) return
        if (error) throw error
        setResult(data as SharedResponse); setError('')
      } catch { if (!cancelled) { setResult(null); setError('暫時無法讀取分享內容，請重試') } }
      finally { fetching = false }
    }
    void read()
    const interval = setInterval(() => void read(), 20_000)
    const refresh = () => { if (!document.hidden) void read() }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('online', refresh)
    return () => { cancelled = true; clearInterval(interval); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('online', refresh) }
  }, [authReady, token, uid, retry])
  async function login() { setBusy(true); setError(''); try { await signInWithGoogle() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Google 登入失敗') } finally { setBusy(false) } }
  const shared = result?.status === 'ok' ? result : null
  const programs = shared?.shortlist.programs.filter(p => `${p.university} ${p.programName}`.toLowerCase().includes(query.toLowerCase())) ?? []
  return <div className="wb-theme shared-page">
    <meta name="robots" content="noindex,nofollow,noarchive" />
    <header className="shared-topbar"><a href={window.location.pathname} className="wb-brand"><span className="wb-brand-mark">e</span><strong>Easier</strong></a><span className="shared-readonly"><Eye size={15} />唯讀</span><div className="wb-actions">{session ? <><span className="wb-muted">{session.user.email}</span><button className="wb-button" onClick={() => void cloud!.auth.signOut()}>登出</button></> : <button className="wb-button" disabled={busy || !cloud} onClick={() => void login()}>使用 Google 登入</button>}</div></header>
    <main className="shared-content">
      {shared ? <><div className="wb-page-heading"><div><h1>選校結果</h1><p>{shared.shortlist.cycle} · {shared.shortlist.programs.length} 個學程</p></div><span className="wb-muted">更新於 {new Date(shared.published_at).toLocaleString('zh-TW')}</span></div><label className="wb-search"><Search size={16} /><input aria-label="搜尋分享學程" placeholder="搜尋學校或學程…" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <div className="shared-groups">{SHORTLIST_RESULTS.map(category => <section className="wb-result-column" data-category={category} key={category}><header><h2>{category}</h2><span>{programs.filter(p => p.category === category).length}</span></header><div className="shared-program-grid">{programs.filter(p => p.category === category).map(p => <article className="shared-program" key={p.id}><p className="wb-muted">{p.university}</p><h3>{p.programName}</h3><p className="wb-muted">{[p.degree,p.campus,p.delivery].filter(Boolean).join(' · ')}</p><dl className="shared-facts"><div><dt>官方截止日</dt><dd>{p.deadline || '尚未確認'}{p.deadlineStatus && <small>{p.deadlineStatus}</small>}<PublicLink url={p.deadlineSource}>官方來源</PublicLink></dd></div>{['gre','toefl','tuition','funding'].map(key => p.requirements[key] && <div key={key}><dt>{requirementLabels[key]}</dt><dd>{p.requirements[key].value}</dd></div>)}</dl><div className="wb-actions"><PublicLink url={p.website}>學程官網</PublicLink><PublicLink url={p.applicationUrl}>申請入口</PublicLink></div><details><summary>學程資訊與來源</summary>{p.areas && <p>{p.areas}</p>}{p.verified && <p className="wb-muted">官方資料核對：{p.verified}</p>}<dl className="shared-facts">{Object.entries(p.requirements).map(([key,fact]) => <div key={key}><dt>{requirementLabels[key] ?? key}</dt><dd>{fact.value}{fact.scope === 'school-reference' && <small>學院／校級參考價</small>}<span className="wb-fact-sources">{fact.sources.map((url,i) => <PublicLink key={`${url}-${i}`} url={url}>來源 {i+1}</PublicLink>)}</span></dd></div>)}</dl></details></article>)}</div></section>)}</div>
      </> : error ? <div className="shared-empty"><h1>無法載入</h1><p role="alert">{error}</p><button className="wb-button" onClick={() => { setError(''); setRetry(value => value + 1) }}>重試</button></div> : result?.status === 'not_found' ? <div className="shared-empty"><h1>此連結已失效或尚未開放</h1><p>請向擁有者取得新的分享連結。</p></div> : result?.status === 'login_required' ? <div className="shared-empty"><h1>登入後查看</h1><p>此分享連結需要登入，內容為唯讀。</p><button className="wb-button primary" disabled={busy} onClick={() => void login()}>使用 Google 帳號登入</button></div> : <div className="shared-empty">正在讀取分享內容…</div>}
    </main>
  </div>
}
function PublicLink({ url, children }: { url: string; children: React.ReactNode }) {
  const safe = safeWebUrl(url)
  return safe ? <a className="wb-link" href={safe} target="_blank" rel="noreferrer">{children}<ExternalLink size={12} /></a> : null
}
