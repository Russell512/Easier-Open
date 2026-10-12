import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Banknote, FlaskConical, HandCoins, Home, Sparkles } from 'lucide-react'
import type { ProgramView } from '../types'
import { displayValue, getValue } from '../lib/workbook'

interface PreviewPosition {
  left: number
  top: number
  side: 'left' | 'right'
}

function shownValue(value: unknown) {
  const shown = displayValue(value as Parameters<typeof displayValue>[0])
  return shown === 'Unknown' ? '尚未提供／需要確認' : shown
}

function PreviewFact({ icon: Icon, label, value }: { icon: typeof Banknote; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-100 bg-stone-50/85 p-3">
      <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.11em] text-stone-400">
        <Icon className="h-3 w-3" />{label}
      </p>
      <p className="mt-1.5 line-clamp-3 text-[11px] font-medium leading-[1.55] text-stone-700">{value}</p>
    </div>
  )
}

export function ProgramQuickPreview({
  program,
  children,
  disabled = false,
}: {
  program: ProgramView
  children: ReactNode
  disabled?: boolean
}) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<number | null>(null)
  const pointerFocusRef = useRef(false)
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState<PreviewPosition | null>(null)

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  function updatePosition() {
    const anchor = anchorRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    const width = Math.min(360, window.innerWidth - 24)
    const gap = 12
    const roomOnRight = window.innerWidth - rect.right
    const side: PreviewPosition['side'] = roomOnRight >= width + gap ? 'right' : 'left'
    const rawLeft = side === 'right' ? rect.right + gap : rect.left - width - gap
    const left = Math.max(12, Math.min(rawLeft, window.innerWidth - width - 12))
    const estimatedHeight = 470
    const top = Math.max(12, Math.min(rect.top, window.innerHeight - estimatedHeight - 12))
    setPosition({ left, top, side })
  }

  function showPreview(immediate = false) {
    if (disabled) return
    if (!immediate && !window.matchMedia('(hover: hover)').matches) return
    clearTimer()
    const show = () => {
      updatePosition()
      setVisible(true)
    }
    if (immediate) show()
    else timerRef.current = window.setTimeout(show, 260)
  }

  function hidePreview() {
    clearTimer()
    setVisible(false)
  }

  useEffect(() => {
    if (!visible) return
    const reposition = () => updatePosition()
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [visible])

  useEffect(() => () => clearTimer(), [])

  const tuition = shownValue(getValue(program.row, 'Tuition'))
  const living = shownValue(getValue(program.row, 'Estimated Living Cost'))
  const funding = shownValue(getValue(program.row, 'RA／TA／Fellowship'))
  const fitReason = shownValue(getValue(program.row, 'Research Fit Reason'))
  const researchAccess = shownValue(getValue(program.row, 'Master’s Research Accessibility'))

  return (
    <div
      ref={anchorRef}
      onMouseEnter={() => showPreview()}
      onMouseLeave={hidePreview}
      onFocusCapture={() => {
        if (!pointerFocusRef.current) showPreview(true)
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) hidePreview()
      }}
      onPointerDownCapture={() => {
        pointerFocusRef.current = true
        hidePreview()
        window.setTimeout(() => { pointerFocusRef.current = false }, 0)
      }}
    >
      {children}
      {visible && position && createPortal(
        <aside
          className="wb-legacy wb-preview pointer-events-none fixed z-[64] max-h-[calc(100vh-24px)] w-[min(360px,calc(100vw-24px))] overflow-y-auto rounded-2xl border border-stone-200 bg-white p-4 shadow-2xl shadow-stone-950/15"
          style={{ left: position.left, top: position.top }}
          role="tooltip"
          data-testid="program-quick-preview"
        >
          <div className="flex items-start justify-between gap-3 border-b border-stone-100 pb-3">
            <div className="min-w-0">
              <p className="truncate text-[9px] font-bold uppercase tracking-[0.13em] text-emerald-700">{program.university}</p>
              <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-5 text-stone-900">{program.programName}</h3>
            </div>
            <span className="shrink-0 rounded-md bg-stone-100 px-2 py-1 text-[9px] font-bold text-stone-600">{program.degree}</span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <PreviewFact icon={Banknote} label="學費／總成本" value={tuition} />
            <PreviewFact icon={Home} label="預計生活費" value={living} />
          </div>
          <div className="mt-2">
            <PreviewFact icon={HandCoins} label="Funding" value={funding} />
          </div>
          <div className="mt-2 rounded-xl bg-[#173f35] p-3 text-white">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.11em] text-emerald-100/60">
                <Sparkles className="h-3 w-3 text-lime-200" />Program fit
              </p>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-lime-200">
                {program.researchFitScore ? `${displayValue(program.researchFitScore)} / 10` : '需要確認'}
              </span>
            </div>
            <p className="mt-2 line-clamp-3 text-[11px] leading-[1.55] text-emerald-50/80">{fitReason}</p>
          </div>
          <div className="mt-2 flex items-start gap-2 rounded-xl border border-violet-100 bg-violet-50/70 p-3">
            <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600" />
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-violet-500">Master’s research access</p>
              <p className="mt-1 line-clamp-2 text-[11px] leading-[1.5] text-violet-900/75">{researchAccess}</p>
            </div>
          </div>
          <p className="mt-3 text-center text-[9px] text-stone-400">資料直接取自目前 workbook · 點擊卡片查看完整內容</p>
        </aside>,
        document.body,
      )}
    </div>
  )
}
