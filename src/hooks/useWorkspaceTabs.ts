import { useCallback, useEffect, useState } from 'react'
import type { AppTab } from '../types'
import { closePage, openPage, openNoteBeside, splitPage, resizePanes, pageHash, reconcileWorkspace, restoreWorkspace, routePage, workspacePage, WORKSPACE_TABS_KEY } from '../lib/workspaceTabs'

export function useWorkspaceTabs() {
  const [state, setState] = useState(() => {
    let saved: string | null = null
    try { saved = localStorage.getItem(WORKSPACE_TABS_KEY) } catch { /* Session-only tabs still work. */ }
    return restoreWorkspace(saved, window.location.hash)
  })
  const active = state.pages.find((page) => page.id === state.activeId)!
  useEffect(() => {
    const onRoute = () => setState((current) => openPage(current, routePage(window.location.hash)))
    window.addEventListener('hashchange', onRoute)
    window.addEventListener('popstate', onRoute)
    return () => {
      window.removeEventListener('hashchange', onRoute)
      window.removeEventListener('popstate', onRoute)
    }
  }, [])
  useEffect(() => {
    // pushState avoids a second navigation event; Back/Forward still activates tabs.
    if (!window.location.hash) window.history.replaceState(null, '', pageHash(active))
    else if (routePage(window.location.hash).id !== active.id) window.history.pushState(null, '', pageHash(active))
  }, [active])
  useEffect(() => {
    try { localStorage.setItem(WORKSPACE_TABS_KEY, JSON.stringify(state)) } catch { /* Does not affect application data. */ }
  }, [state])
  const open = useCallback((tab: AppTab, school: string | null = null) => setState((current) => openPage(current, workspacePage(tab, school))), [])
  const activate = useCallback((id: string) => setState((current) => current.pages.some((page) => page.id === id) ? openPage(current, current.pages.find(page => page.id === id)!) : current), [])
  const close = useCallback((id: string) => setState((current) => closePage(current, id)), [])
  const reconcile = useCallback((ids: ReadonlySet<string>, noteIds?: ReadonlySet<string>) => setState((current) => reconcileWorkspace(current, ids, noteIds)), [])
  const openNote = useCallback((id: string) => setState(current => openNoteBeside(current, id)), [])
  const split = useCallback((page: import('../lib/workspaceTabs').WorkspacePage, targetId?: string, side?: 'left' | 'right') => setState(current => splitPage(current, page, targetId, side)), [])
  const resize = useCallback((index: number, size: number) => setState(current => resizePanes(current, index, size)), [])
  return { ...state, active, open, activate, close, reconcile, openNote, split, resize }
}
