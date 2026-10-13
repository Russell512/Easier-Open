import type { DragEvent } from 'react'
import { routePage, workspacePage, type WorkspacePage } from './workspaceTabs'
export const PAGE_DRAG_TYPE = 'application/x-easier-page'
export function readDraggedPage(transfer: DataTransfer): WorkspacePage | null {
  try {
    const value = JSON.parse(transfer.getData(PAGE_DRAG_TYPE))
    if (!value || typeof value.tab !== 'string' || (value.school !== null && typeof value.school !== 'string') || (value.noteId !== undefined && typeof value.noteId !== 'string')) return null
    if (routePage(`#view=${encodeURIComponent(value.tab)}`).tab !== value.tab) return null
    return workspacePage(value.tab, value.school, value.noteId)
  } catch { return null }
}
export function dragPage(event: DragEvent, page: WorkspacePage, title: string) {
  event.dataTransfer.setData(PAGE_DRAG_TYPE, JSON.stringify(page))
  event.dataTransfer.effectAllowed = 'move'
  // Use a small, readable drag label instead of a screenshot of the whole note.
  const preview = document.createElement('div')
  preview.className = 'wb-drag-preview'
  preview.textContent = title
  document.body.append(preview)
  event.dataTransfer.setDragImage(preview, 20, 18)
  setTimeout(() => preview.remove(), 0)
}
