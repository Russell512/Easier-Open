import type { DragEvent } from 'react'
import type { WorkspacePage } from './workspaceTabs'
export const PAGE_DRAG_TYPE = 'application/x-easier-page'
export function dragPage(event: DragEvent, page: WorkspacePage) {
  event.dataTransfer.setData(PAGE_DRAG_TYPE, JSON.stringify(page))
  event.dataTransfer.effectAllowed = 'move'
}
