import MarkdownIt from 'markdown-it'
import mark from 'markdown-it-mark'

const markdown = new MarkdownIt({ html: false, breaks: true, linkify: true }).use(mark)

markdown.renderer.rules.link_open = (tokens, index, options, _env, renderer) => {
  tokens[index]!.attrSet('target', '_blank')
  tokens[index]!.attrSet('rel', 'noopener noreferrer')
  return renderer.renderToken(tokens, index, options)
}
const renderImage = markdown.renderer.rules.image!
markdown.renderer.rules.image = (tokens, index, options, env, renderer) => {
  tokens[index]!.attrSet('loading', 'lazy')
  return renderImage(tokens, index, options, env, renderer)
}

export function renderNoteMarkdown(value: string) {
  return markdown.render(value)
}
