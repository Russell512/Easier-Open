import { saveLocalValue } from './cloudClient'
export const NOTES_STORAGE_KEY = 'easier-application-notes-v2'
export const LEGACY_NOTES_STORAGE_KEY = 'easier-global-notes-v1'

export interface NoteChecklistItem {
  id: string
  text: string
  checked: boolean
}

export interface ApplicationNote {
  id: string
  programId?: string
  title: string
  body: string
  checklist: NoteChecklistItem[]
  createdAt: string
  updatedAt: string
}

export function updateProgramNote(state: ApplicationNotesState, programId: string, title: string, body: string): ApplicationNotesState {
  const existing = state.notes.find((note) => note.programId === programId)
  if (existing) {
    if (existing.body === body) return state
    return {
      ...state,
      notes: state.notes.map((note) => note.id === existing.id
        ? { ...note, body, updatedAt: new Date().toISOString() }
        : note),
    }
  }
  if (!body) return state
  const note = { ...createBlankNote(title), programId, body }
  return { ...state, notes: [note, ...state.notes] }
}

export interface ApplicationNotesState {
  version: 2
  notes: ApplicationNote[]
  selectedNoteId: string
}

function makeId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${prefix}:${crypto.randomUUID()}`
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`
}

export function createBlankNote(title = '新的筆記'): ApplicationNote {
  const now = new Date().toISOString()
  return {
    id: makeId('note'),
    title,
    body: '',
    checklist: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function createChecklistItem(): NoteChecklistItem {
  return { id: makeId('check'), text: '', checked: false }
}

function sanitizeChecklist(value: unknown): NoteChecklistItem[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const candidate = item as Partial<NoteChecklistItem>
    return [{
      id: typeof candidate.id === 'string' && candidate.id ? candidate.id : makeId('check'),
      text: typeof candidate.text === 'string' ? candidate.text : '',
      checked: candidate.checked === true,
    }]
  })
}

function sanitizeNote(value: unknown): ApplicationNote | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<ApplicationNote>
  const now = new Date().toISOString()
  if (typeof candidate.id !== 'string' || !candidate.id) return null
  return {
    id: candidate.id,
    ...(typeof candidate.programId === 'string' && candidate.programId ? { programId: candidate.programId } : {}),
    title: typeof candidate.title === 'string' ? candidate.title : '未命名筆記',
    body: typeof candidate.body === 'string' ? candidate.body : '',
    checklist: sanitizeChecklist(candidate.checklist),
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : now,
  }
}

function loadCurrentNotes(): ApplicationNotesState | null {
  const raw = localStorage.getItem(NOTES_STORAGE_KEY)
  if (!raw) return null
  const parsed = JSON.parse(raw) as Partial<ApplicationNotesState>
  const notes = Array.isArray(parsed.notes)
    ? parsed.notes.map(sanitizeNote).filter((note): note is ApplicationNote => note !== null)
    : []
  const selectedNoteId = typeof parsed.selectedNoteId === 'string' && notes.some((note) => note.id === parsed.selectedNoteId)
    ? parsed.selectedNoteId
    : notes[0]?.id ?? ''
  return { version: 2, notes, selectedNoteId }
}

function migrateLegacyNote(): ApplicationNotesState | null {
  const raw = localStorage.getItem(LEGACY_NOTES_STORAGE_KEY)
  if (!raw) return null
  const parsed = JSON.parse(raw) as { text?: unknown; savedAt?: unknown }
  if (typeof parsed.text !== 'string' || !parsed.text.trim()) return null
  const note = createBlankNote('申請筆記（原筆記）')
  note.body = parsed.text
  if (typeof parsed.savedAt === 'string' && parsed.savedAt) {
    note.createdAt = parsed.savedAt
    note.updatedAt = parsed.savedAt
  }
  return { version: 2, notes: [note], selectedNoteId: note.id }
}

export function loadApplicationNotes(): ApplicationNotesState {
  try {
    const current = loadCurrentNotes()
    if (current) return current
    const migrated = migrateLegacyNote()
    if (migrated) return migrated
  } catch {
    // A malformed local draft must not prevent the rest of the app from loading.
  }
  const note = createBlankNote()
  return { version: 2, notes: [note], selectedNoteId: note.id }
}

export function saveApplicationNotes(state: ApplicationNotesState) {
  saveLocalValue(NOTES_STORAGE_KEY, JSON.stringify(state))
}
