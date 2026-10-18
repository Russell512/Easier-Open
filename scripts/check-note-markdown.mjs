import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { build } from 'esbuild'
import { EditorState } from '@codemirror/state'
import { history, undo, redo } from '@codemirror/commands'

await fs.mkdir('.local', { recursive: true })
await build({ entryPoints: ['src/lib/noteMarkdown.ts', 'src/lib/renderNoteMarkdown.ts'], bundle: true, platform: 'node', format: 'esm', packages: 'external', outdir: '.local/note-markdown-test' })
const { formatNoteSelection, normalizeNoteUrl, noteLinkEdit, noteToMarkdown } = await import('../.local/note-markdown-test/noteMarkdown.js')
const { renderNoteMarkdown } = await import('../.local/note-markdown-test/renderNoteMarkdown.js')
const apply = (text, edit) => text.slice(0, edit.from) + edit.insert + text.slice(edit.to)

for (const [format, marker, tag] of [['bold', '**', 'strong'], ['italic', '*', 'em'], ['highlight', '==', 'mark']]) {
  const text = '前文重要內容後文'
  const edit = formatNoteSelection(text, 2, 6, format)
  const formatted = apply(text, edit)
  assert.equal(formatted, `前文${marker}重要內容${marker}後文`)
  assert.match(renderNoteMarkdown(formatted), new RegExp(`<${tag}>重要內容</${tag}>`))
  assert.equal(apply(formatted, formatNoteSelection(formatted, edit.anchor, edit.head, format)), text, 'clicking again removes the mark')
  const empty = formatNoteSelection('', 0, 0, format)
  assert.ok(empty.head > empty.anchor, 'empty selections insert a selected placeholder')
  const spaces = ' \n  '
  const noOp = formatNoteSelection(spaces, 0, spaces.length, format)
  assert.equal(apply(spaces, noOp), spaces)
  const multiline = ' 第一行 \n第二行\n\n第三行'
  const multiEdit = formatNoteSelection(multiline, 0, multiline.length, format)
  const multiText = apply(multiline, multiEdit)
  assert.equal((renderNoteMarkdown(multiText).match(new RegExp(`<${tag}>`, 'g')) ?? []).length, 3)
  assert.equal(apply(multiText, formatNoteSelection(multiText, multiEdit.anchor, multiEdit.head, format)), multiline)
}
assert.equal(apply('**重點**', formatNoteSelection('**重點**', 2, 4, 'italic')), '***重點***', 'italic layers onto bold')
assert.equal(apply('***重點***', formatNoteSelection('***重點***', 3, 5, 'italic')), '**重點**')
assert.equal(apply('第一行\n第二行\n第三行', formatNoteSelection('第一行\n第二行\n第三行', 0, 8, 'list')), '- 第一行\n- 第二行\n第三行', 'a selection ending at a new line does not include the next line')
assert.equal(apply('\n原文', formatNoteSelection('\n原文', 0, 0, 'heading')), '## \n原文', 'format the empty first line')

assert.equal(normalizeNoteUrl('example.com/research'), 'https://example.com/research')
assert.equal(normalizeNoteUrl('mailto:admissions@example.edu'), 'mailto:admissions@example.edu')
for (const unsafe of ['javascript:alert(1)', 'data:text/html,test', 'file:///tmp/test', 'java\nscript:alert(1)', 'https://exa mple.edu', '']) assert.equal(normalizeNoteUrl(unsafe), null)
const link = noteLinkEdit(0, 4, '[申請] **資訊**', 'https://example.edu/path_(test)?a=1&b=2')
const linkHtml = renderNoteMarkdown(link.insert)
assert.match(linkHtml, /href="https:\/\/example.edu\/path_\(test\)\?a=1&amp;b=2"/)
assert.match(linkHtml, /target="_blank" rel="noopener noreferrer"/)
assert.ok(!linkHtml.includes('<strong>'), 'link labels are escaped')
for (const content of ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '[bad](javascript:alert(1))', '[bad](data:text/html,test)']) {
  assert.doesNotMatch(renderNoteMarkdown(content), /<script|<img|href="(?:javascript|data):/i)
}
assert.match(renderNoteMarkdown('第一行\n第二行'), /第一行<br>\n第二行/, 'existing plain text retains its line breaks')
assert.match(renderNoteMarkdown('`==code==`'), /<code>==code==<\/code>/, 'code is not highlighted as prose')

const body = '原有中文 📝\n\n**粗體** 與 ==重點==\n[官方資訊](https://example.edu)\n'
const exported = noteToMarkdown({ title: '申請 #1', body, checklist: [{ id: '1', text: '讀完要求', checked: true }, { id: '2', text: '準備 **原文**\n附上文件', checked: false }] })
assert.ok(exported.startsWith('# 申請 \\#1\n\n'))
assert.ok(exported.includes(body), 'copy preserves the exact original body')
assert.ok(exported.includes('- [x] 讀完要求\n- [ ] 準備 \\*\\*原文\\*\\*\n  附上文件'))
assert.equal(noteToMarkdown({ title: '', body: '', checklist: [] }), '# 未命名筆記')

let state = EditorState.create({ doc: '需要加粗', extensions: [history()] })
const edit = formatNoteSelection(state.doc.toString(), 0, 4, 'bold')
state = state.update({ changes: { from: edit.from, to: edit.to, insert: edit.insert }, selection: { anchor: edit.anchor, head: edit.head }, userEvent: 'input.format' }).state
const target = { get state() { return state }, dispatch(transaction) { state = transaction.state } }
assert.equal(state.doc.toString(), '**需要加粗**')
assert.ok(undo(target))
assert.equal(state.doc.toString(), '需要加粗')
assert.ok(redo(target))
assert.equal(state.doc.toString(), '**需要加粗**')
console.log('PASS: Markdown formatting, Chinese selections, multiline toggles, undo/redo, safe links/rendering and complete Markdown export.')
