import type { ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'
import type { CellValue, ProgramView } from '../../types'
import { schoolInitials } from './helpers'
import { safeWebUrl } from '../../lib/documents'

export function SchoolIcon({ program, small = false }: { program: ProgramView; small?: boolean }) {
  const hue = [...program.university].reduce((n, c) => n + c.charCodeAt(0), 0) % 3
  return <span className={`wb-school-icon school-color-${hue} ${small ? 'small' : ''}`} aria-hidden="true">{schoolInitials(program.university)}</span>
}
export function PageHeading({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <header className="wb-page-heading"><div><p className="wb-eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{actions && <div className="wb-actions">{actions}</div>}</header>
}
export function Panel({ title, icon, action, children, className = '' }: { title: string; icon?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`wb-panel ${className}`}><header className="wb-panel-header"><h2>{icon}{title}</h2>{action}</header>{children}</section>
}
export function SourceLink({ value, children, className = 'wb-link' }: { value: CellValue; children: ReactNode; className?: string }) {
  const url = safeWebUrl(String(value ?? ''))
  return url ? <a href={url} className={className} target="_blank" rel="noopener noreferrer">{children}<ExternalLink size={13} /></a> : null
}
