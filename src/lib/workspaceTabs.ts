import type { AppTab } from '../types'

export const WORKSPACE_TABS_KEY = 'easier-workspace-tabs-v1'
export const MAX_PANES = 4
const views: AppTab[] = ['dashboard', 'programs', 'compare', 'documents', 'selection', 'results', 'faculty', 'checklist', 'sop-materials', 'notes', 'data']
export interface WorkspacePage { id: string; tab: AppTab; school: string | null; noteId?: string }
export interface WorkspacePane { pageId: string; size: number }
export interface WorkspaceTabsState { pages: WorkspacePage[]; activeId: string; panes: WorkspacePane[] }

export function workspacePage(tab: AppTab, school: string | null = null, noteId?: string): WorkspacePage {
  if (noteId) return { id: `note:${noteId}`, tab: 'notes', school: null, noteId }
  return { id: school ? `school:${school}` : `view:${tab}`, tab: school ? 'programs' : tab, school }
}
export function routePage(hash: string): WorkspacePage {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const view = params.get('view') as AppTab
  return workspacePage(views.includes(view) ? view : 'dashboard', params.get('school') || null, params.get('note') || undefined)
}
export function pageHash(page: WorkspacePage): string {
  return '#' + new URLSearchParams({ view: page.tab, ...(page.school ? { school: page.school } : {}), ...(page.noteId ? { note: page.noteId } : {}) }).toString()
}
function normalize(panes: WorkspacePane[]): WorkspacePane[] {
  const total = panes.reduce((sum, p) => sum + p.size, 0)
  return panes.map(p => ({ ...p, size: p.size / total }))
}
export function openPage(state: WorkspaceTabsState, page: WorkspacePage): WorkspaceTabsState {
  if (state.activeId === page.id) return state
  const panes = state.panes.some(p => p.pageId === page.id) ? state.panes : state.panes.map(p => p.pageId === state.activeId ? { ...p, pageId: page.id } : p)
  return { pages: state.pages.some(item => item.id === page.id) ? state.pages : [...state.pages, page], activeId: page.id, panes }
}
// Insert a page beside the target. Moving a visible page never duplicates its editor.
export function splitPage(state: WorkspaceTabsState, page: WorkspacePage, targetId = state.activeId, side: 'left' | 'right' = 'right'): WorkspaceTabsState {
  if (page.id === targetId) return state
  const existing = state.panes.find(p => p.pageId === page.id)
  if (!existing && state.panes.length >= MAX_PANES) return state
  const panes = state.panes.filter(p => p.pageId !== page.id).map(p => ({ ...p }))
  const index = panes.findIndex(p => p.pageId === targetId)
  if (index < 0) return state
  const size = existing?.size ?? 1 / (panes.length + 1)
  if (!existing) for (const pane of panes) pane.size *= 1 - size
  panes.splice(index + (side === 'right' ? 1 : 0), 0, { pageId: page.id, size })
  return { pages: state.pages.some(p => p.id === page.id) ? state.pages : [...state.pages, page], activeId: page.id, panes: normalize(panes) }
}
export function openNoteBeside(state: WorkspaceTabsState, noteId: string): WorkspaceTabsState {
  const page = workspacePage('notes', null, noteId)
  if (state.panes.some(p => p.pageId === page.id)) return openPage(state, page)
  // Reuse the rightmost note editor when all four panes are occupied.
  if (state.panes.length >= MAX_PANES) {
    const target = [...state.panes].reverse().find(p => state.pages.find(page => page.id === p.pageId)?.noteId) ?? state.panes[state.panes.length - 1]!
    return openPage({ ...state, activeId: target.pageId }, page)
  }
  return splitPage(state, page, state.panes[state.panes.length - 1]!.pageId)
}
export function resizePanes(state: WorkspaceTabsState, index: number, leftSize: number): WorkspaceTabsState {
  if (!state.panes[index + 1]) return state
  const total = state.panes[index]!.size + state.panes[index + 1]!.size
  const min = Math.min(0.12, total / 3)
  const next = Math.max(min, Math.min(total - min, leftSize))
  return { ...state, panes: state.panes.map((p, i) => i === index ? { ...p, size: next } : i === index + 1 ? { ...p, size: total - next } : p) }
}
export function closePage(state: WorkspaceTabsState, id: string): WorkspaceTabsState {
  const index = state.pages.findIndex(page => page.id === id)
  if (index < 0) return state
  const pages = state.pages.filter(page => page.id !== id)
  if (!pages.length) return initialWorkspace()
  const remaining = state.panes.filter(p => p.pageId !== id)
  const fallback = pages[Math.min(index, pages.length - 1)]!.id
  const panes = remaining.length ? normalize(remaining) : [{ pageId: fallback, size: 1 }]
  const activeId = state.activeId === id ? panes[Math.min(state.panes.findIndex(p => p.pageId === id), panes.length - 1)]!.pageId : state.activeId
  return { pages, panes, activeId }
}
export function initialWorkspace(): WorkspaceTabsState {
  const dashboard = workspacePage('dashboard')
  return { pages: [dashboard], activeId: dashboard.id, panes: [{ pageId: dashboard.id, size: 1 }] }
}
export function restoreWorkspace(saved: string | null, hash: string): WorkspaceTabsState {
  let state = initialWorkspace()
  try {
    const value = JSON.parse(saved ?? 'null')
    if (value && Array.isArray(value.pages)) {
      const pages: WorkspacePage[] = []
      for (const item of value.pages) {
        if (!item || !views.includes(item.tab) || (item.school !== null && typeof item.school !== 'string') || (item.noteId !== undefined && typeof item.noteId !== 'string')) continue
        const page = workspacePage(item.tab, item.school || null, item.noteId || undefined)
        if (!pages.some(existing => existing.id === page.id)) pages.push(page)
      }
      if (pages.length) {
        const activeId = pages.some(p => p.id === value.activeId) ? value.activeId : pages[0]!.id
        const panes: WorkspacePane[] = []
        if (Array.isArray(value.panes)) for (const p of value.panes) {
          if (p && pages.some(page => page.id === p.pageId) && !panes.some(item => item.pageId === p.pageId) && typeof p.size === 'number' && Number.isFinite(p.size) && p.size > 0 && panes.length < MAX_PANES) panes.push({ pageId: p.pageId, size: p.size })
        }
        if (!panes.some(p => p.pageId === activeId)) panes.splice(Math.max(0, panes.length - 1), 1, { pageId: activeId, size: 1 })
        state = { pages, activeId, panes: normalize(panes) }
      }
    }
  } catch { /* Damaged preferences must not prevent opening the workspace. */ }
  return hash && hash !== '#' ? openPage(state, routePage(hash)) : state
}
export function reconcileWorkspace(state: WorkspaceTabsState, schoolIds: ReadonlySet<string>, noteIds?: ReadonlySet<string>): WorkspaceTabsState {
  return state.pages.reduce((next, page) => (page.school && !schoolIds.has(page.school)) || (page.noteId && noteIds && !noteIds.has(page.noteId)) ? closePage(next, page.id) : next, state)
}
