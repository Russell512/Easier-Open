import type { NoteChecklistItem } from './notes'

export type NoteFormat = 'bold' | 'italic' | 'highlight' | 'heading' | 'list' | 'quote'
export interface MarkdownEdit {
  from: number
  to: number
  insert: string
  anchor: number
  head: number
}

export function formatNoteSelection(value: string, from: number, to: number, format: NoteFormat): MarkdownEdit {
  if (format === 'heading' || format === 'list' || format === 'quote') {
    const start = from === 0 ? 0 : value.lastIndexOf('\n', from - 1) + 1
    const last = to > from && value[to - 1] === '\n' ? to - 1 : to
    const nextBreak = value.indexOf('\n', last)
    const end = nextBreak < 0 ? value.length : nextBreak
    const prefix = { heading: '## ', list: '- ', quote: '> ' }[format]
    const lines = value.slice(start, end).split('\n')
    const remove = lines.every(line => line.startsWith(prefix))
    const insert = lines.map(line => remove ? line.slice(prefix.length) : prefix + line).join('\n')
    return { from: start, to: end, insert, anchor: start, head: start + insert.length }
  }

  const marker = { bold: '**', italic: '*', highlight: '==' }[format]
  const selected = value.slice(from, to)
  if (selected && !selected.trim()) return { from, to, insert: selected, anchor: from, head: to }
  const isWrapped = (text: string) => text.startsWith(marker) && text.endsWith(marker) && text.length > marker.length * 2
    && (marker !== '*' || ((text.match(/^\*+/)?.[0].length ?? 0) % 2 === 1 && (text.match(/\*+$/)?.[0].length ?? 0) % 2 === 1))
  const outsideItalic = marker !== '*' || ((value.slice(0, from).match(/\*+$/)?.[0].length ?? 0) % 2 === 1 && (value.slice(to).match(/^\*+/)?.[0].length ?? 0) % 2 === 1)
  if (!selected.includes('\n') && outsideItalic && from >= marker.length && value.slice(from - marker.length, from) === marker && value.slice(to, to + marker.length) === marker) {
    return { from: from - marker.length, to: to + marker.length, insert: selected, anchor: from - marker.length, head: to - marker.length }
  }
  if (!selected.includes('\n') && isWrapped(selected)) {
    const insert = selected.slice(marker.length, -marker.length)
    return { from, to, insert, anchor: from, head: from + insert.length }
  }
  const content = selected || { bold: '粗體文字', italic: '斜體文字', highlight: '重點文字' }[format]
  if (content.includes('\n')) {
    const lines = content.split('\n')
    const remove = lines.filter(line => line.trim()).every(line => isWrapped(line.trim()))
    const insert = lines.map(line => line.replace(/^(\s*)(.*?)(\s*)$/, (_match, before, text, after) => {
      if (!text) return line
      return before + (remove ? text.slice(marker.length, -marker.length) : isWrapped(text) ? text : marker + text + marker) + after
    })).join('\n')
    return { from, to, insert, anchor: from, head: from + insert.length }
  }
  // Keep whitespace outside delimiters so selecting a whole line still renders correctly.
  const insert = content.split('\n').map(line => line.trim() ? line.replace(/^(\s*)(.*?)(\s*)$/, `$1${marker}$2${marker}$3`) : line).join('\n')
  const leading = content.length - content.trimStart().length
  const trailing = content.length - content.trimEnd().length
  return { from, to, insert, anchor: from + leading + marker.length, head: from + insert.length - trailing - marker.length }
}

export function normalizeNoteUrl(value: string): string | null {
  const input = value.trim()
  if (!input || Array.from(input).some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)) return null
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`)
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.href : null
  } catch { return null }
}

function escapeMarkdownText(value: string) {
  return value.replace(/([\\`*_[\]{}<>=~#!|])/g, '\\$1')
}

export function noteLinkEdit(from: number, to: number, label: string, url: string): MarkdownEdit {
  const text = escapeMarkdownText(label.replace(/\r?\n/g, ' ').trim() || url)
  const insert = `[${text}](<${url.replace(/</g, '%3C').replace(/>/g, '%3E')}>)`
  return { from, to, insert, anchor: from + insert.length, head: from + insert.length }
}

export function noteToMarkdown(note: { title: string; body: string; checklist: NoteChecklistItem[] }): string {
  const title = escapeMarkdownText(note.title.replace(/\r?\n/g, ' ').trim() || '未命名筆記')
  const tasks = note.checklist.map(item => `- [${item.checked ? 'x' : ' '}] ${escapeMarkdownText(item.text).replace(/\r?\n/g, '\n  ')}`)
  return [`# ${title}`, note.body, tasks.length ? `## Checklist\n\n${tasks.join('\n')}` : ''].filter(Boolean).join('\n\n')
}
