import { useEffect, useMemo, useRef, useState } from 'react'
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
import './commandPalette.css'

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

const kindMeta: Record<CommandKind, { label: string; icon: typeof Search }> = {
  navigation: { label: '前往', icon: Command },
  program: { label: '學程', icon: University },
  faculty: { label: '教授', icon: UserRoundSearch },
  deadline: { label: '截止日', icon: CalendarDays },
  checklist: { label: '材料', icon: CheckSquare },
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

export function CommandPalette({ open, items, onOpen, onClose, onSelect }: {
  open: boolean
  items: CommandItem[]
  onOpen: () => void
  onClose: () => void
  onSelect: (item: CommandItem) => void
}) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [availableHeight, setAvailableHeight] = useState(440)
  const host = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const selected = useRef<HTMLButtonElement>(null)
  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const candidates = normalized
      ? items.filter(item => `${item.title} ${item.subtitle} ${item.searchText}`.toLowerCase().includes(normalized))
      : items.filter(item => item.featured)
    return candidates.slice(0, 12)
  }, [items, query])
  const selectedIndex = Math.min(activeIndex, Math.max(0, results.length - 1))

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    input.current?.focus({ preventScroll: true })
    const resize = () => {
      const bottom = host.current?.getBoundingClientRect().bottom ?? 0
      setAvailableHeight(Math.max(96, (window.visualViewport?.height ?? window.innerHeight) - bottom - 12))
    }
    resize()
    const observer = new ResizeObserver(resize)
    if (host.current) observer.observe(host.current)
    window.addEventListener('resize', resize)
    window.visualViewport?.addEventListener('resize', resize)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', resize)
      window.visualViewport?.removeEventListener('resize', resize)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !host.current?.contains(event.target)) onClose()
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open, onClose])

  useEffect(() => {
    if (open) selected.current?.scrollIntoView({ block: 'nearest' })
  }, [open, selectedIndex, query])

  function closeAndFocus() {
    onClose()
    requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }))
  }
  function choose(item: CommandItem) {
    onSelect(item)
    closeAndFocus()
  }

  return <div ref={host} className={`wb-command-host${open ? ' is-open' : ''}`} onBlur={event => {
    if (open && event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) onClose()
  }}>
    {open ? <div className="wb-command-input-row">
      <Search size={14} aria-hidden="true" />
      <input ref={input} className="wb-command-input" value={query}
        onChange={event => { setQuery(event.target.value); setActiveIndex(0) }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setActiveIndex(index => Math.min(index + 1, Math.max(results.length - 1, 0)))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActiveIndex(index => Math.max(index - 1, 0))
          } else if (event.key === 'Enter' && results[selectedIndex]) {
            event.preventDefault()
            choose(results[selectedIndex])
          } else if (event.key === 'Escape') {
            event.preventDefault(); event.stopPropagation(); closeAndFocus()
          }
        }}
        placeholder="搜尋學校、學程、教授或功能…" aria-label="搜尋工作區"
        role="combobox" aria-autocomplete="list" aria-expanded="true"
        aria-controls="workspace-search-results"
        aria-activedescendant={results.length ? `workspace-search-option-${selectedIndex}` : undefined}
      />
      <button className="wb-command-close" onClick={closeAndFocus} aria-label="關閉搜尋" title="關閉搜尋（Esc）"><X size={14} /></button>
    </div> : <button ref={trigger} className="wb-command" onClick={onOpen} aria-label="搜尋學校、教授或功能" aria-haspopup="listbox" aria-expanded="false">
      <Search size={14} aria-hidden="true" /><span>搜尋學校、教授或功能…</span><kbd>⌘ K</kbd>
    </button>}
    {open && <div className="wb-command-dropdown" data-testid="command-palette" style={{ maxHeight: availableHeight }}>
      <div className="wb-command-results" role="listbox" id="workspace-search-results" aria-label={query.trim() ? '搜尋結果' : '快速前往'}>
        {results.map((item, index) => {
          const meta = kindMeta[item.kind]
          const Icon = meta.icon
          const active = index === selectedIndex
          return <button key={item.id} id={`workspace-search-option-${index}`} ref={active ? selected : undefined}
            role="option" aria-selected={active} tabIndex={-1}
            className={`wb-command-option${active ? ' active' : ''}`}
            title={item.kind === 'navigation' ? item.title : `${item.title}\n${item.subtitle}`}
            onMouseMove={() => setActiveIndex(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(item)}>
            <Icon size={15} className="wb-command-kind-icon" aria-hidden="true" />
            <span className="wb-command-option-copy"><span className="wb-command-option-title">{item.title}</span>
              {item.kind !== 'navigation' && <small>{item.subtitle}</small>}
            </span>
            {item.kind !== 'navigation' && <span className="wb-command-kind">{meta.label}</span>}
            <CornerDownLeft size={13} className="wb-command-enter" aria-hidden="true" />
          </button>
        })}
      </div>
      {!results.length && <p className="wb-command-empty" role="status">找不到符合的項目</p>}
      <footer className="wb-command-footer"><span>↑↓ 選擇<span className="wb-command-footer-enter"> · Enter 開啟</span></span><span>Esc 關閉</span></footer>
    </div>}
  </div>
}
