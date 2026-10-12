import fontkit from '@pdf-lib/fontkit'
import {
  PDFDocument,
  PageSizes,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib'
import {
  downloadBlob,
  exportableSections,
  localDateStamp,
  type SopMaterialBankState,
} from './sopMaterialBank'

interface PdfFonts {
  latin: PDFFont
  cjk: PDFFont
}

function normalizePdfText(text: string) {
  return text
    .replaceAll('：', ': ')
    .replaceAll('？', '?')
    .replaceAll('！', '!')
    .replaceAll('／', '/')
    .replaceAll('、', ', ')
    .replaceAll('（', '(')
    .replaceAll('）', ')')
    .replaceAll('「', '"')
    .replaceAll('」', '"')
    .replaceAll('—', '-')
    .replaceAll('–', '-')
    .replaceAll('…', '...')
}

function fontForCharacter(fonts: PdfFonts, character: string) {
  return (character.codePointAt(0) ?? 0) <= 0xff ? fonts.latin : fonts.cjk
}

function textWidth(fonts: PdfFonts, text: string, size: number) {
  return Array.from(text).reduce(
    (width, character) => width + fontForCharacter(fonts, character).widthOfTextAtSize(character, size),
    0,
  )
}

function wrapText(fonts: PdfFonts, source: string, size: number, maxWidth: number) {
  const lines: string[] = []
  const text = normalizePdfText(source)
  text.replace(/\r\n/g, '\n').split('\n').forEach((paragraph) => {
    if (!paragraph) {
      lines.push('')
      return
    }
    let current = ''
    Array.from(paragraph).forEach((character) => {
      const next = `${current}${character}`
      if (current && textWidth(fonts, next, size) > maxWidth) {
        lines.push(current.trimEnd())
        current = character.trimStart()
      } else {
        current = next
      }
    })
    if (current) lines.push(current.trimEnd())
  })
  return lines
}

export async function exportSopMaterialBankPdf(
  state: SopMaterialBankState,
  fontUrl: string,
) {
  const date = localDateStamp()
  const fontResponse = await fetch(fontUrl)
  if (!fontResponse.ok) throw new Error(`PDF 字型載入失敗（HTTP ${fontResponse.status}）`)

  const document = await PDFDocument.create()
  document.registerFontkit(fontkit)
  // fontkit's CJK subsetting can produce incomplete glyph maps in some PDF viewers.
  // Embedding this compact static TrueType font keeps Traditional Chinese reliable.
  const cjkFont = await document.embedFont(await fontResponse.arrayBuffer(), { subset: false })
  const latinFont = await document.embedFont(StandardFonts.Helvetica)
  const fonts: PdfFonts = { latin: latinFont, cjk: cjkFont }
  const [pageWidth, pageHeight] = PageSizes.A4
  const margin = 48
  const contentWidth = pageWidth - margin * 2
  const colors = {
    ink: rgb(0.09, 0.13, 0.11),
    muted: rgb(0.36, 0.4, 0.38),
    green: rgb(0.07, 0.27, 0.22),
    rule: rgb(0.86, 0.88, 0.86),
  }

  let page: PDFPage = document.addPage(PageSizes.A4)
  let y = pageHeight - margin

  const ensureSpace = (height: number) => {
    if (y - height >= margin) return
    page = document.addPage(PageSizes.A4)
    y = pageHeight - margin
  }

  const drawText = (
    text: string,
    size: number,
    color: ReturnType<typeof rgb>,
    lineHeight: number,
    indent = 0,
  ) => {
    const lines = wrapText(fonts, text, size, contentWidth - indent)
    lines.forEach((line) => {
      ensureSpace(lineHeight)
      if (line) {
        let x = margin + indent
        let run = ''
        let runFont = fontForCharacter(fonts, line[0]!)
        const flush = () => {
          if (!run) return
          page.drawText(run, { x, y, size, font: runFont, color })
          x += runFont.widthOfTextAtSize(run, size)
          run = ''
        }
        Array.from(line).forEach((character) => {
          const characterFont = fontForCharacter(fonts, character)
          if (characterFont !== runFont) {
            flush()
            runFont = characterFont
          }
          run += character
        })
        flush()
      }
      y -= lineHeight
    })
  }

  drawText('SOP Material Bank', 22, colors.green, 29)
  drawText(`匯出日期：${date}`, 9.5, colors.muted, 17)
  y -= 8
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 1,
    color: colors.green,
  })
  y -= 22

  exportableSections(state).forEach((section) => {
    ensureSpace(48)
    drawText(section.heading, 15, colors.green, 22)
    y -= 3
    section.entries.forEach((entry) => {
      ensureSpace(32)
      drawText(entry.heading, 11.5, colors.ink, 18)
      entry.fields.forEach((field) => {
        ensureSpace(34)
        drawText(field.label, 9.5, colors.green, 15, 4)
        drawText(field.value, 10.5, colors.ink, 17, 4)
        y -= 7
      })
      y -= 5
    })
    ensureSpace(14)
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 0.5,
      color: colors.rule,
    })
    y -= 18
  })

  const pages = document.getPages()
  pages.forEach((currentPage, index) => {
    currentPage.drawText(`${index + 1} / ${pages.length}`, {
      x: pageWidth - margin - 24,
      y: 24,
      size: 8,
      font: latinFont,
      color: colors.muted,
    })
  })

  const bytes = await document.save()
  const data = new Uint8Array(bytes.byteLength)
  data.set(bytes)
  downloadBlob(new Blob([data.buffer], { type: 'application/pdf' }), `SOP_Material_Bank_${date}.pdf`)
}
