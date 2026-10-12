import { useCallback, useEffect, useState } from 'react'
import {
  createBlankNote,
  createChecklistItem,
  loadApplicationNotes,
  saveApplicationNotes,
  updateProgramNote as editProgramNote,
  type ApplicationNote,
  type ApplicationNotesState,
  type NoteChecklistItem,
} from '../lib/notes'

export interface ApplicationNotesController {
  state: ApplicationNotesState
  selectedNote?: ApplicationNote
  saving: boolean
  lastSaved: string
  saveError: string
  retrySave: () => void
  selectNote: (id: string) => void
  createNote: () => string
  updateNote: (id: string, patch: Partial<Pick<ApplicationNote, 'title' | 'body'>>) => void
  updateProgramNote: (programId: string, title: string, body: string) => void
  deleteNote: (id: string) => void
  addChecklistItem: (noteId: string) => void
  updateChecklistItem: (noteId: string, itemId: string, patch: Partial<Pick<NoteChecklistItem, 'text' | 'checked'>>) => void
  deleteChecklistItem: (noteId: string, itemId: string) => void
}

export function useApplicationNotes(): ApplicationNotesController {
  const [state, setState] = useState<ApplicationNotesState>(loadApplicationNotes)
  const [savedState, setSavedState] = useState<ApplicationNotesState | null>(null)
  const [lastSaved, setLastSaved] = useState('')
  const [saveError, setSaveError] = useState('')

  const persist = useCallback(() => {
    try {
      saveApplicationNotes(state)
      setSavedState(state)
      setLastSaved(new Date().toISOString())
      setSaveError('')
    } catch {
      setSaveError('筆記尚未儲存，請先保留頁面並複製內容，再重試。')
    }
  }, [state])

  // Save each committed edit locally without a debounce window before refresh.
  // CloudGate batches the resulting notifications for cloud synchronization.
  useEffect(persist, [persist])

  const updateProgramNote = useCallback((programId: string, title: string, body: string) => {
    setState((current) => editProgramNote(current, programId, title, body))
  }, [])

  const selectNote = useCallback((id: string) => {
    setState((current) => current.notes.some((note) => note.id === id)
      ? { ...current, selectedNoteId: id }
      : current)
  }, [])

  const createNote = useCallback(() => {
    const note = createBlankNote()
    setState((current) => ({
      ...current,
      notes: [note, ...current.notes],
      selectedNoteId: note.id,
    }))
    return note.id
  }, [])

  const updateNote = useCallback((id: string, patch: Partial<Pick<ApplicationNote, 'title' | 'body'>>) => {
    setState((current) => ({
      ...current,
      notes: current.notes.map((note) => note.id === id
        ? { ...note, ...patch, updatedAt: new Date().toISOString() }
        : note),
    }))
  }, [])

  const deleteNote = useCallback((id: string) => {
    setState((current) => {
      const index = current.notes.findIndex((note) => note.id === id)
      if (index < 0) return current
      const notes = current.notes.filter((note) => note.id !== id)
      const selectedNoteId = current.selectedNoteId === id
        ? notes[Math.min(index, Math.max(notes.length - 1, 0))]?.id ?? ''
        : current.selectedNoteId
      return { ...current, notes, selectedNoteId }
    })
  }, [])

  const addChecklistItem = useCallback((noteId: string) => {
    setState((current) => ({
      ...current,
      notes: current.notes.map((note) => note.id === noteId
        ? { ...note, checklist: [...note.checklist, createChecklistItem()], updatedAt: new Date().toISOString() }
        : note),
    }))
  }, [])

  const updateChecklistItem = useCallback((noteId: string, itemId: string, patch: Partial<Pick<NoteChecklistItem, 'text' | 'checked'>>) => {
    setState((current) => ({
      ...current,
      notes: current.notes.map((note) => note.id === noteId
        ? {
            ...note,
            checklist: note.checklist.map((item) => item.id === itemId ? { ...item, ...patch } : item),
            updatedAt: new Date().toISOString(),
          }
        : note),
    }))
  }, [])

  const deleteChecklistItem = useCallback((noteId: string, itemId: string) => {
    setState((current) => ({
      ...current,
      notes: current.notes.map((note) => note.id === noteId
        ? {
            ...note,
            checklist: note.checklist.filter((item) => item.id !== itemId),
            updatedAt: new Date().toISOString(),
          }
        : note),
    }))
  }, [])

  return {
    state,
    selectedNote: state.notes.find((note) => note.id === state.selectedNoteId),
    saving: savedState !== state && !saveError,
    lastSaved,
    saveError,
    retrySave: persist,
    selectNote,
    createNote,
    updateNote,
    updateProgramNote,
    deleteNote,
    addChecklistItem,
    updateChecklistItem,
    deleteChecklistItem,
  }
}
