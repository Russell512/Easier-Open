import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  CheckSquare,
  Command,
  CornerDownLeft,
  Search,
  University,
  UserRoundSearch,
  X,
} from 'lucide-react'
import type { AppTab } from '../types'

export type CommandKind = 'navigation' | 'program' | 'faculty' | 'deadline' | 'checklist'

export interface CommandItem {
  id: string
  kind: CommandKind
  title: string
  subtitle: string
  searchText: string
  featured?: boolean
  target: {
    tab: AppTab
    programId?: string
    facultyId?: string
    checklistProgramId?: string
  }
}

const kindMeta: Record<CommandKind, { label: string; icon: typeof Search; tone: string }> = {
  navigation: { label: '快速前往', icon: Command, tone: 'bg-stone-100 text-stone-700' },
  program: { label: 'Program', icon: University, tone: 'bg-emerald-50 text-emerald-700' },
  faculty: { label: 'Faculty', icon: UserRoundSearch, tone: 'bg-violet-50 text-violet-700' },
  deadline: { label: 'Deadline', icon: CalendarDays, tone: 'bg-amber-50 text-amber-700' },
  checklist: { label: 'Checklist', icon: CheckSquare, tone: 'bg-sky-50 text-sky-700' },
}

export function SplashScreen({ leaving }: { leaving: boolean }) {
  return (
    <div
      className={`easier-splash ${leaving ? 'easier-splash-leaving' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Easier 正在開啟 Fall 2027 application workspace"
      data-testid="easier-splash"
    >
      <div className="easier-signature" aria-hidden="true">
        <div className="easier-signature-word-wrap">
          <span className="easier-signature-word">Easier</span>
          <span className="easier-signature-pen" />
        </div>
        <span className="easier-signature-flourish" />
        <p>Fall 2027 application workspace</p>
      </div>
    </div>
  )
}

export function CommandPalette({
  open,
  items,
  onClose,
  onSelect,
}: {
  open: boolean
  items: CommandItem[]
  onClose: () => void
  onSelect: (item: CommandItem) => void
}) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const candidates = normalized
      ? items.filter((item) => `${item.title} ${item.subtitle} ${item.searchText}`.toLowerCase().includes(normalized))
      : items.filter((item) => item.featured)
    return candidates.slice(0, 12)
  }, [items, query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
  }, [open])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  if (!open) return null

  function choose(item: CommandItem) {
    onSelect(item)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[95] flex justify-center bg-stone-950/45 px-4 pt-[10vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="command-palette-title"
      data-testid="command-palette"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="h-fit w-full max-w-2xl overflow-hidden rounded-3xl border border-white/30 bg-white shadow-2xl shadow-stone-950/25">
        <div className="flex items-center gap-3 border-b border-stone-200 px-4">
          <Search className="h-5 w-5 shrink-0 text-emerald-700" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setActiveIndex((index) => Math.min(index + 1, Math.max(results.length - 1, 0)))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActiveIndex((index) => Math.max(index - 1, 0))
              } else if (event.key === 'Enter' && results[activeIndex]) {
                event.preventDefault()
                choose(results[activeIndex])
              } else if (event.key === 'Escape') {
                onClose()
              }
            }}
            placeholder="搜尋 University、Program、Faculty、Deadline、Checklist、SOP…"
            aria-label="搜尋 application workspace"
            className="h-16 min-w-0 flex-1 bg-transparent text-sm text-stone-900 outline-none placeholder:text-stone-400"
          />
          <button
            onClick={onClose}
            className="rounded-lg border border-stone-200 p-1.5 text-stone-400 hover:bg-stone-50 hover:text-stone-700"
            aria-label="關閉 Command Palette"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[58vh] overflow-y-auto p-2">
          <div className="flex items-center justify-between px-3 py-2">
            <p id="command-palette-title" className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">
              {query ? `${results.length} 個搜尋結果` : 'Workspace shortcuts'}
            </p>
            <span className="text-[10px] text-stone-400">↑↓ 選擇 · Enter 開啟</span>
          </div>
          {results.map((item, index) => {
            const meta = kindMeta[item.kind]
            const Icon = meta.icon
            return (
              <button
                key={item.id}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(item)}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors ${
                  index === activeIndex ? 'bg-[#173f35] text-white' : 'text-stone-800 hover:bg-stone-50'
                }`}
              >
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                  index === activeIndex ? 'bg-white/10 text-lime-200' : meta.tone
                }`}>
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[9px] font-bold uppercase tracking-[0.13em] ${
                    index === activeIndex ? 'text-emerald-100/70' : 'text-stone-400'
                  }`}>{meta.label}</span>
                  <span className="mt-0.5 block truncate text-sm font-semibold">{item.title}</span>
                  <span className={`mt-0.5 block truncate text-[11px] ${
                    index === activeIndex ? 'text-emerald-50/65' : 'text-stone-500'
                  }`}>{item.subtitle}</span>
                </span>
                {index === activeIndex && <CornerDownLeft className="h-4 w-4 shrink-0 text-emerald-100/60" />}
              </button>
            )
          })}
          {!results.length && (
            <div className="grid min-h-48 place-items-center px-6 text-center">
              <div>
                <Search className="mx-auto h-7 w-7 text-stone-300" />
                <p className="mt-3 text-sm font-semibold text-stone-700">找不到符合的項目</p>
                <p className="mt-1 text-xs text-stone-400">試試學校、教授姓名、材料名稱或 deadline。</p>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-stone-100 bg-stone-50/80 px-4 py-2.5 text-[10px] text-stone-400">
          <span className="inline-flex items-center gap-1.5"><Command className="h-3 w-3" />Easier command palette</span>
          <span>Esc 關閉</span>
        </div>
      </div>
    </div>
  )
}
