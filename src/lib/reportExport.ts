import type { Content, ContentText, TableCell, TableCellProperties, TDocumentDefinitions } from 'pdfmake/interfaces'
import { lotQuantityInPacks, packagingSummary } from '../domain/product'
import { formatDate } from './date'
import type { ComparedProduct, Product } from '../types'

export type NearDateReportLot = {
  productionDate: string
  quantityPacks: number | null
  datePercent: number
}

export type NearDateReportProduct = {
  productCode: string
  productName: string
  vietnameseName: string
  packaging: string
  saleNote: string
  isNewDate: boolean
  lots: NearDateReportLot[]
}

export type ReportOrientation = 'portrait' | 'landscape'
export type ReportPrintMode = 'monochrome' | 'color'
export type ReportLayoutMode = 'compact' | 'detailed'

const BRAND = '115E59'
const BRAND_LIGHT = 'CCFBF1'
const NOTE_FILL = 'FFF7D6'
const NOTE_INK = '713F12'
const BORDER = 'CBD5E1'
const MUTED = '64748B'

function fileDate(date: string) {
  const [year, month, day] = date.split('-')
  return year && month && day ? `${day}-${month}-${year}` : date
}

function numberText(value: number | null) {
  return value === null ? '—' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value)
}

export function prepareNearDateReport(rows: ComparedProduct[], products: Product[]): NearDateReportProduct[] {
  return rows.flatMap((row) => {
    if (!row.current) return []
    const product = products.find((item) => item.id === row.productId)
    const grouped = new Map<string, NearDateReportLot>()
    for (const lot of row.current.lots) {
      const quantityPacks = product ? lotQuantityInPacks(lot, product) : lot.unit === 'gói' ? lot.quantity : null
      const key = `${lot.productionDate}|${lot.datePercent}`
      const existing = grouped.get(key)
      if (existing) {
        existing.quantityPacks = existing.quantityPacks === null || quantityPacks === null ? null : existing.quantityPacks + quantityPacks
      } else {
        grouped.set(key, { productionDate: lot.productionDate, quantityPacks, datePercent: lot.datePercent })
      }
    }
    const lots = [...grouped.values()].sort((a, b) => a.productionDate.localeCompare(b.productionDate) || a.datePercent - b.datePercent)
    return [{
      productCode: row.productCode,
      productName: row.productName,
      vietnameseName: row.vietnameseName,
      packaging: product ? packagingSummary(product) : 'Chưa bổ sung quy cách',
      saleNote: row.current.saleNote?.trim() ?? '',
      isNewDate: row.current.isNewDate,
      lots,
    }]
  })
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function createNearDateWordBlob(report: NearDateReportProduct[], date: string, orientation: ReportOrientation = 'portrait', printMode: ReportPrintMode = 'monochrome', layoutMode: ReportLayoutMode = 'compact') {
  const {
    AlignmentType,
    BorderStyle,
    Document,
    Footer,
    PageNumber,
    PageOrientation,
    Packer,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableLayoutType,
    TableRow,
    TextRun,
    VerticalAlign,
    WidthType,
  } = await import('docx')

  const monochrome = printMode === 'monochrome'
  const border = { style: BorderStyle.SINGLE, size: monochrome ? 8 : 4, color: monochrome ? '000000' : BORDER }
  const emphasisBorder = { style: BorderStyle.SINGLE, size: 16, color: '000000' }
  const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border }
  const cellMargins = { top: 100, bottom: 100, left: 140, right: 140 }
  const columnWidths = orientation === 'landscape' ? [3800, 7300, 4200] : [2700, 5000, 2760]
  const [codeWidth, detailWidth, stateWidth] = columnWidths
  const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0)
  const cell = (children: InstanceType<typeof Paragraph>[], width: number, options: { fill?: string; span?: number; rowSpan?: number; verticalAlign?: 'top' | 'center' | 'bottom'; borders?: typeof borders; margins?: typeof cellMargins } = {}) => new TableCell({
    children,
    width: { size: width, type: WidthType.DXA },
    columnSpan: options.span,
    rowSpan: options.rowSpan,
    margins: options.margins ?? cellMargins,
    verticalAlign: options.verticalAlign ?? VerticalAlign.CENTER,
    shading: options.fill ? { type: ShadingType.CLEAR, fill: options.fill } : undefined,
    borders: options.borders,
  })
  const textParagraph = (text: string, options: { bold?: boolean; color?: string; size?: number; align?: typeof AlignmentType[keyof typeof AlignmentType]; keepNext?: boolean } = {}) => new Paragraph({
    alignment: options.align,
    keepNext: options.keepNext,
    spacing: { before: 0, after: 0, line: 276 },
    children: [new TextRun({ text, bold: options.bold, color: options.color, size: options.size ?? 20, font: 'Arial' })],
  })

  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 80 },
      children: [new TextRun({ text: 'DANH SÁCH HÀNG CẬN DATE', bold: true, color: monochrome ? '000000' : BRAND, size: 34, font: 'Arial' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 80 },
      children: [new TextRun({ text: `Ngày dữ liệu: ${formatDate(date)}  •  ${report.length} mã  •  ${report.reduce((sum, item) => sum + item.lots.length, 0)} dòng NSX`, color: MUTED, size: 20, font: 'Arial' })],
    }),
  ]

  if (!report.length) {
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 300 }, children: [new TextRun({ text: 'Không có dữ liệu phù hợp để xuất.', color: MUTED, size: 24, font: 'Arial' })] }))
  }

  if (layoutMode === 'compact' && report.length) {
    const compactWidths = orientation === 'landscape' ? [3400, 1300, 2000, 1600, 1200, 5800] : [2500, 1000, 1500, 1250, 900, 3310]
    const compactTotal = compactWidths.reduce((sum, width) => sum + width, 0)
    const compactMargins = { top: 55, bottom: 55, left: 85, right: 85 }
    const compactParagraph = (text: string, options: { bold?: boolean; color?: string; size?: number; align?: typeof AlignmentType[keyof typeof AlignmentType] } = {}) => new Paragraph({
      alignment: options.align,
      spacing: { before: 0, after: 0, line: 220 },
      children: [new TextRun({ text, bold: options.bold, color: options.color, size: options.size ?? 17, font: 'Arial' })],
    })
    const productBorder = { style: BorderStyle.SINGLE, size: monochrome ? 14 : 8, color: monochrome ? '000000' : BRAND }
    const compactRows: InstanceType<typeof TableRow>[] = [new TableRow({
      cantSplit: true,
      tableHeader: true,
      children: ['MÃ / TÊN SẢN PHẨM', 'CÓ MỚI?', 'NSX', 'SL (GÓI)', '% DATE', 'GHI CHÚ SALE'].map((label, index) => cell([
        compactParagraph(label, { bold: true, color: monochrome ? '000000' : BRAND, size: 17, align: AlignmentType.CENTER }),
      ], compactWidths[index], { fill: monochrome ? 'E7E7E7' : BRAND_LIGHT, margins: compactMargins })),
    })]

    report.forEach((item) => {
      const lots = item.lots.length ? item.lots : [{ productionDate: '', quantityPacks: null, datePercent: 0 }]
      lots.forEach((lot, lotIndex) => {
        const first = lotIndex === 0
        const last = lotIndex === lots.length - 1
        const rowBorder = {
          top: first ? productBorder : border,
          bottom: last ? productBorder : border,
          left: border,
          right: border,
          insideHorizontal: border,
          insideVertical: border,
        }
        const rowCells: InstanceType<typeof TableCell>[] = []
        if (first) {
          const productLines = [
            compactParagraph(item.productCode, { bold: true, color: monochrome ? '000000' : BRAND, size: 21 }),
            compactParagraph(item.vietnameseName || item.productName || 'Chưa bổ sung tên sản phẩm', { bold: true, size: 17 }),
          ]
          productLines.push(compactParagraph(`QC: ${item.packaging}`, { size: 14, color: MUTED }))
          rowCells.push(cell(productLines, compactWidths[0], { verticalAlign: VerticalAlign.TOP, borders: rowBorder, margins: compactMargins }))
        } else rowCells.push(cell([compactParagraph('')], compactWidths[0], { borders: rowBorder, margins: compactMargins }))
        if (first) rowCells.push(cell([
          compactParagraph(item.isNewDate ? 'CÓ MỚI' : 'KHÔNG CÓ MỚI', { bold: true, color: monochrome ? '000000' : BRAND, size: 15, align: AlignmentType.CENTER }),
        ], compactWidths[1], { rowSpan: lots.length, verticalAlign: VerticalAlign.CENTER, borders: rowBorder, margins: compactMargins }))
        rowCells.push(
          cell([compactParagraph(lot.productionDate ? formatDate(lot.productionDate) : '—', { bold: true, size: 18, align: AlignmentType.CENTER })], compactWidths[2], { borders: rowBorder, margins: compactMargins }),
          cell([compactParagraph(numberText(lot.quantityPacks), { bold: true, size: 19, align: AlignmentType.CENTER })], compactWidths[3], { borders: rowBorder, margins: compactMargins }),
          cell([compactParagraph(lot.productionDate ? `${lot.datePercent}%` : '—', { bold: true, color: monochrome ? '000000' : BRAND, size: 22, align: AlignmentType.CENTER })], compactWidths[4], { borders: rowBorder, margins: compactMargins }),
        )
        if (first) {
          rowCells.push(cell(item.saleNote ? [
            compactParagraph('ƯU TIÊN THỰC HIỆN', { bold: true, color: monochrome ? '000000' : NOTE_INK, size: 15 }),
            compactParagraph(item.saleNote, { bold: true, color: monochrome ? '000000' : '422006', size: 18 }),
          ] : [compactParagraph('—', { color: MUTED, size: 17, align: AlignmentType.CENTER })], compactWidths[5], {
            verticalAlign: item.saleNote ? VerticalAlign.TOP : VerticalAlign.CENTER,
            fill: item.saleNote && !monochrome ? NOTE_FILL : 'FFFFFF',
            borders: rowBorder,
            margins: compactMargins,
          }))
        } else rowCells.push(cell([compactParagraph('')], compactWidths[5], { borders: rowBorder, margins: compactMargins }))
        compactRows.push(new TableRow({ cantSplit: true, keepNext: !last && lots.length <= 8, children: rowCells }))
      })
    })
    children.push(new Table({
      width: { size: compactTotal, type: WidthType.DXA },
      columnWidths: compactWidths,
      layout: TableLayoutType.FIXED,
      borders,
      rows: compactRows,
    }))
  } else report.forEach((item, index) => {
    const infoLines = [
      item.productName || 'Chưa bổ sung tên sản phẩm',
      item.vietnameseName || 'Chưa bổ sung tên tiếng Việt',
      `Quy cách: ${item.packaging}`,
    ]
    const rows = [
      new TableRow({
        cantSplit: true,
        tableHeader: true,
        children: [
          cell([textParagraph(`MÃ: ${item.productCode}`, { bold: true, color: monochrome ? '000000' : 'FFFFFF', size: monochrome ? 28 : 25, keepNext: true })], codeWidth, { fill: monochrome ? 'FFFFFF' : BRAND }),
          cell(infoLines.map((line, lineIndex) => textParagraph(line, { bold: lineIndex === 0, color: monochrome ? '000000' : 'FFFFFF', size: lineIndex === 0 ? 22 : 18, keepNext: true })), detailWidth, { fill: monochrome ? 'FFFFFF' : BRAND }),
          cell([textParagraph(monochrome ? (item.isNewDate ? '[ CÓ MỚI ]' : '[ KHÔNG CÓ MỚI ]') : (item.isNewDate ? 'CÓ MỚI' : 'KHÔNG CÓ MỚI'), { bold: true, color: monochrome ? '000000' : 'FFFFFF', size: monochrome ? 23 : 21, align: AlignmentType.CENTER, keepNext: true })], stateWidth, { fill: monochrome ? 'FFFFFF' : BRAND }),
        ],
      }),
      new TableRow({
        cantSplit: true,
        tableHeader: true,
        children: [cell([
          textParagraph(monochrome ? 'GHI CHÚ SALE - ƯU TIÊN THỰC HIỆN' : 'GHI CHÚ SALE', { bold: true, color: monochrome ? '000000' : NOTE_INK, size: monochrome ? 20 : 18, keepNext: true }),
          textParagraph(item.saleNote || 'Chưa có ghi chú Sale.', { bold: monochrome || Boolean(item.saleNote), color: monochrome ? '000000' : item.saleNote ? '422006' : MUTED, size: item.saleNote ? (monochrome ? 23 : 22) : 19, keepNext: true }),
        ], tableWidth, { fill: monochrome ? 'FFFFFF' : NOTE_FILL, span: 3, verticalAlign: VerticalAlign.TOP, borders: monochrome ? { top: emphasisBorder, bottom: emphasisBorder, left: emphasisBorder, right: emphasisBorder, insideHorizontal: emphasisBorder, insideVertical: emphasisBorder } : undefined })],
      }),
      new TableRow({
        cantSplit: true,
        tableHeader: true,
        children: [
          cell([textParagraph('NSX', { bold: true, color: monochrome ? '000000' : BRAND, size: monochrome ? 21 : 20, align: AlignmentType.CENTER, keepNext: true })], codeWidth, { fill: monochrome ? 'E7E7E7' : BRAND_LIGHT }),
          cell([textParagraph('SỐ LƯỢNG (GÓI)', { bold: true, color: monochrome ? '000000' : BRAND, size: monochrome ? 21 : 20, align: AlignmentType.CENTER, keepNext: true })], detailWidth, { fill: monochrome ? 'E7E7E7' : BRAND_LIGHT }),
          cell([textParagraph('% DATE', { bold: true, color: monochrome ? '000000' : BRAND, size: monochrome ? 21 : 20, align: AlignmentType.CENTER, keepNext: true })], stateWidth, { fill: monochrome ? 'E7E7E7' : BRAND_LIGHT }),
        ],
      }),
      ...item.lots.map((lot, lotIndex) => new TableRow({
        cantSplit: true,
        children: [
          cell([textParagraph(formatDate(lot.productionDate), { bold: true, size: monochrome ? 24 : 23, align: AlignmentType.CENTER, keepNext: lotIndex < item.lots.length - 1 })], codeWidth, { fill: monochrome ? 'FFFFFF' : lotIndex % 2 ? 'F8FAFC' : 'FFFFFF' }),
          cell([textParagraph(numberText(lot.quantityPacks), { bold: true, size: monochrome ? 25 : 23, align: AlignmentType.CENTER, keepNext: lotIndex < item.lots.length - 1 })], detailWidth, { fill: monochrome ? 'FFFFFF' : lotIndex % 2 ? 'F8FAFC' : 'FFFFFF' }),
          cell([textParagraph(`${lot.datePercent}%`, { bold: true, color: monochrome ? '000000' : BRAND, size: monochrome ? 29 : 25, align: AlignmentType.CENTER, keepNext: lotIndex < item.lots.length - 1 })], stateWidth, { fill: monochrome ? 'FFFFFF' : lotIndex % 2 ? 'F8FAFC' : 'FFFFFF' }),
        ],
      })),
    ]
    children.push(new Table({
      width: { size: tableWidth, type: WidthType.DXA },
      columnWidths,
      layout: TableLayoutType.FIXED,
      borders,
      rows,
    }))
    if (index < report.length - 1) children.push(new Paragraph({ spacing: { before: 0, after: 100 }, children: [] }))
  })

  const documentFile = new Document({
    creator: 'Chat Cận Date',
    title: `Danh sách hàng cận date ${formatDate(date)}`,
    styles: { default: { document: { run: { font: 'Arial', size: 20 }, paragraph: { spacing: { after: 80, line: 276 } } } } },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838, orientation: orientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
          margin: { top: 600, right: 720, bottom: 600, left: 720, header: 300, footer: 300 },
        },
      },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: ['Trang ', PageNumber.CURRENT], color: MUTED, size: 17, font: 'Arial' })] })] }) },
      children,
    }],
  })
  return Packer.toBlob(documentFile)
}

function pdfCell(text: Content, options: Omit<Partial<ContentText & TableCellProperties>, 'text'> = {}): TableCell {
  return { text, margin: [8, 7, 8, 7], ...options } as ContentText & TableCellProperties
}

export async function createNearDatePdfBlob(report: NearDateReportProduct[], date: string, orientation: ReportOrientation = 'portrait', printMode: ReportPrintMode = 'monochrome', layoutMode: ReportLayoutMode = 'compact') {
  const [{ default: pdfMake }, { default: roboto }] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/fonts/Roboto'),
  ])
  pdfMake.addFontContainer(roboto)
  const monochrome = printMode === 'monochrome'

  const content: Content[] = [
    { text: 'DANH SÁCH HÀNG CẬN DATE', style: 'title' },
    { text: `Ngày dữ liệu: ${formatDate(date)}  •  ${report.length} mã  •  ${report.reduce((sum, item) => sum + item.lots.length, 0)} dòng NSX`, style: 'summary' },
  ]
  if (!report.length) content.push({ text: 'Không có dữ liệu phù hợp để xuất.', alignment: 'center', color: `#${MUTED}`, margin: [0, 40, 0, 0] })

  const compactPdfWidths: (number | string)[] = orientation === 'landscape' ? [165, 70, 72, 62, 50, '*'] : [125, 55, 68, 55, 42, '*']
  const compactHeaderRow = (): TableCell[] => [
    pdfCell('MÃ / TÊN SẢN PHẨM', { bold: true, color: monochrome ? '#000000' : `#${BRAND}`, fillColor: monochrome ? '#E7E7E7' : `#${BRAND_LIGHT}`, alignment: 'center', fontSize: 8 }),
    pdfCell('CÓ MỚI?', { bold: true, color: monochrome ? '#000000' : `#${BRAND}`, fillColor: monochrome ? '#E7E7E7' : `#${BRAND_LIGHT}`, alignment: 'center', fontSize: 8 }),
    pdfCell('NSX', { bold: true, color: monochrome ? '#000000' : `#${BRAND}`, fillColor: monochrome ? '#E7E7E7' : `#${BRAND_LIGHT}`, alignment: 'center', fontSize: 8 }),
    pdfCell('SL (GÓI)', { bold: true, color: monochrome ? '#000000' : `#${BRAND}`, fillColor: monochrome ? '#E7E7E7' : `#${BRAND_LIGHT}`, alignment: 'center', fontSize: 8 }),
    pdfCell('% DATE', { bold: true, color: monochrome ? '#000000' : `#${BRAND}`, fillColor: monochrome ? '#E7E7E7' : `#${BRAND_LIGHT}`, alignment: 'center', fontSize: 8 }),
    pdfCell('GHI CHÚ SALE', { bold: true, color: monochrome ? '#000000' : `#${BRAND}`, fillColor: monochrome ? '#E7E7E7' : `#${BRAND_LIGHT}`, alignment: 'center', fontSize: 8 }),
  ]
  const compactLayout = {
    hLineColor: () => monochrome ? '#000000' : `#${BORDER}`,
    vLineColor: () => monochrome ? '#000000' : `#${BORDER}`,
    hLineWidth: () => monochrome ? 1.1 : 0.7,
    vLineWidth: (lineIndex: number) => monochrome ? (lineIndex === 0 || lineIndex === 6 ? 1.1 : 0.55) : 0.5,
    paddingLeft: () => 0,
    paddingRight: () => 0,
    paddingTop: () => 0,
    paddingBottom: () => 0,
  }

  if (layoutMode === 'compact' && report.length) {
    content.push({ table: { widths: compactPdfWidths, body: [compactHeaderRow()] }, layout: compactLayout, margin: [0, 0, 0, 0] })
    report.forEach((item) => {
      const lots = item.lots.length ? item.lots : [{ productionDate: '', quantityPacks: null, datePercent: 0 }]
      for (let offset = 0; offset < lots.length; offset += 8) {
        const segment = lots.slice(offset, offset + 8)
        const continued = offset > 0
        const productCharsPerLine = orientation === 'landscape' ? 34 : 25
        const noteCharsPerLine = orientation === 'landscape' ? 70 : 38
        const productLineCount = 2
          + Math.ceil((item.vietnameseName || item.productName || '').length / productCharsPerLine)
          + Math.ceil((4 + item.packaging.length) / productCharsPerLine)
        const noteLineCount = item.saleNote ? 1 + Math.ceil(item.saleNote.length / noteCharsPerLine) : 1
        const requiredGroupHeight = Math.max(productLineCount * 10 + 8, noteLineCount * 11 + 8, segment.length * 19)
        const rowHeight = Math.ceil(requiredGroupHeight / segment.length)
        const body: TableCell[][] = segment.map((lot, lotIndex) => {
          const first = lotIndex === 0
          const row: TableCell[] = []
          if (first) row.push(pdfCell([
            { text: `${item.productCode}${continued ? ' (tiếp)' : ''}\n`, bold: true, color: monochrome ? '#000000' : `#${BRAND}`, fontSize: 10 },
            { text: `${item.vietnameseName || item.productName || 'Chưa bổ sung tên sản phẩm'}\n`, bold: true, fontSize: 8.5 },
            { text: `QC: ${item.packaging}`, color: `#${MUTED}`, fontSize: 7 },
          ], { rowSpan: segment.length, alignment: 'left', fillColor: '#FFFFFF', margin: [5, 4, 5, 4] }))
          else row.push({})
          if (first) row.push(pdfCell(item.isNewDate ? 'CÓ MỚI' : 'KHÔNG CÓ MỚI', { rowSpan: segment.length, bold: true, color: monochrome ? '#000000' : `#${BRAND}`, alignment: 'center', fontSize: 8, margin: [3, 4, 3, 4] }))
          else row.push({})
          row.push(
            pdfCell(lot.productionDate ? formatDate(lot.productionDate) : '—', { bold: true, alignment: 'center', fontSize: 9, margin: [4, 4, 4, 4] }),
            pdfCell(numberText(lot.quantityPacks), { bold: true, alignment: 'center', fontSize: 9.5, margin: [4, 4, 4, 4] }),
            pdfCell(lot.productionDate ? `${lot.datePercent}%` : '—', { bold: true, color: monochrome ? '#000000' : `#${BRAND}`, alignment: 'center', fontSize: 11, margin: [4, 4, 4, 4] }),
          )
          if (first) row.push(pdfCell(item.saleNote ? [
            { text: 'ƯU TIÊN THỰC HIỆN\n', bold: true, color: monochrome ? '#000000' : `#${NOTE_INK}`, fontSize: 7.5 },
            { text: item.saleNote, bold: true, color: monochrome ? '#000000' : '#422006', fontSize: 9 },
          ] : '—', { rowSpan: segment.length, alignment: item.saleNote ? 'left' : 'center', fillColor: item.saleNote && !monochrome ? `#${NOTE_FILL}` : '#FFFFFF', margin: [5, 4, 5, 4] }))
          else row.push({})
          return row
        })
        content.push({
          table: { dontBreakRows: true, widths: compactPdfWidths, heights: rowHeight, body },
          layout: compactLayout,
          unbreakable: true,
          margin: [0, 0, 0, 0],
        })
      }
    })
  } else report.forEach((item) => {
    const details = [item.productName || 'Chưa bổ sung tên sản phẩm', item.vietnameseName || 'Chưa bổ sung tên tiếng Việt', `Quy cách: ${item.packaging}`].join('\n')
    const body: TableCell[][] = [
      [
        pdfCell(`MÃ: ${item.productCode}`, { bold: true, color: monochrome ? '#000000' : '#FFFFFF', fillColor: monochrome ? '#FFFFFF' : `#${BRAND}`, fontSize: monochrome ? 13 : 12 }),
        pdfCell(details, { bold: true, color: monochrome ? '#000000' : '#FFFFFF', fillColor: monochrome ? '#FFFFFF' : `#${BRAND}`, fontSize: 10 }),
        pdfCell(monochrome ? (item.isNewDate ? '[ CÓ MỚI ]' : '[ KHÔNG CÓ MỚI ]') : (item.isNewDate ? 'CÓ MỚI' : 'KHÔNG CÓ MỚI'), { bold: true, color: monochrome ? '#000000' : '#FFFFFF', fillColor: monochrome ? '#FFFFFF' : `#${BRAND}`, alignment: 'center', fontSize: monochrome ? 11 : 10 }),
      ],
      [
        pdfCell([
          { text: monochrome ? 'GHI CHÚ SALE - ƯU TIÊN THỰC HIỆN\n' : 'GHI CHÚ SALE\n', bold: true, color: monochrome ? '#000000' : `#${NOTE_INK}`, fontSize: monochrome ? 10 : 9 },
          { text: item.saleNote || 'Chưa có ghi chú Sale.', bold: monochrome || Boolean(item.saleNote), color: monochrome ? '#000000' : item.saleNote ? '#422006' : `#${MUTED}`, fontSize: item.saleNote ? (monochrome ? 12 : 11) : 9 },
        ], { colSpan: 3, fillColor: monochrome ? '#FFFFFF' : `#${NOTE_FILL}` }),
        {},
        {},
      ],
      [
        pdfCell('NSX', { bold: true, color: monochrome ? '#000000' : `#${BRAND}`, fillColor: monochrome ? '#E7E7E7' : `#${BRAND_LIGHT}`, alignment: 'center', fontSize: monochrome ? 10 : 9 }),
        pdfCell('SỐ LƯỢNG (GÓI)', { bold: true, color: monochrome ? '#000000' : `#${BRAND}`, fillColor: monochrome ? '#E7E7E7' : `#${BRAND_LIGHT}`, alignment: 'center', fontSize: monochrome ? 10 : 9 }),
        pdfCell('% DATE', { bold: true, color: monochrome ? '#000000' : `#${BRAND}`, fillColor: monochrome ? '#E7E7E7' : `#${BRAND_LIGHT}`, alignment: 'center', fontSize: monochrome ? 10 : 9 }),
      ],
      ...item.lots.map((lot, lotIndex): TableCell[] => [
        pdfCell(formatDate(lot.productionDate), { bold: true, alignment: 'center', fillColor: monochrome ? '#FFFFFF' : lotIndex % 2 ? '#F8FAFC' : '#FFFFFF', fontSize: monochrome ? 12 : 11 }),
        pdfCell(numberText(lot.quantityPacks), { bold: true, alignment: 'center', fillColor: monochrome ? '#FFFFFF' : lotIndex % 2 ? '#F8FAFC' : '#FFFFFF', fontSize: monochrome ? 12 : 11 }),
        pdfCell(`${lot.datePercent}%`, { bold: true, color: monochrome ? '#000000' : `#${BRAND}`, alignment: 'center', fillColor: monochrome ? '#FFFFFF' : lotIndex % 2 ? '#F8FAFC' : '#FFFFFF', fontSize: monochrome ? 14 : 12 }),
      ]),
    ]
    content.push({
      table: { headerRows: 3, keepWithHeaderRows: 1, dontBreakRows: true, widths: orientation === 'landscape' ? [140, '*', 100] : [105, '*', 75], body },
      layout: {
        hLineColor: () => monochrome ? '#000000' : `#${BORDER}`,
        vLineColor: () => monochrome ? '#000000' : `#${BORDER}`,
        hLineWidth: (lineIndex) => monochrome ? ([0, 1, 2, 3, body.length].includes(lineIndex) ? 1.5 : 0.8) : 0.7,
        vLineWidth: (lineIndex) => monochrome ? (lineIndex === 0 || lineIndex === 3 ? 1.5 : 0.8) : 0.7,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0,
      },
      margin: [0, 0, 0, 12],
    })
  })

  const definition: TDocumentDefinitions = {
    info: { title: `Danh sách hàng cận date ${formatDate(date)}`, author: 'Chat Cận Date', subject: 'Báo cáo cận date dành cho thủ kho' },
    pageSize: 'A4',
    pageOrientation: orientation,
    pageMargins: [28, 48, 28, 30],
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#0F172A', lineHeight: 1.18 },
    styles: {
      title: { fontSize: 18, bold: true, color: monochrome ? '#000000' : `#${BRAND}`, alignment: 'center', margin: [0, 0, 0, 4] },
      summary: { fontSize: 9, color: `#${MUTED}`, alignment: 'center', margin: [0, 0, 0, 12] },
    },
    header: (currentPage) => layoutMode === 'compact' && currentPage > 1
      ? { table: { widths: compactPdfWidths, body: [compactHeaderRow()] }, layout: compactLayout, margin: [28, 16, 28, 0] }
      : { text: currentPage > 1 ? `CẬN DATE • ${formatDate(date)}` : '', alignment: 'right', color: `#${MUTED}`, fontSize: 8, margin: [0, 18, 28, 0] },
    footer: (currentPage, pageCount) => ({ text: `Trang ${currentPage}/${pageCount}`, alignment: 'right', color: `#${MUTED}`, fontSize: 8, margin: [0, 6, 28, 0] }),
    content,
  }
  return pdfMake.createPdf(definition).getBlob()
}

export async function exportNearDateReport(rows: ComparedProduct[], date: string, type: 'docx' | 'pdf', products: Product[], orientation: ReportOrientation = 'portrait', printMode: ReportPrintMode = 'monochrome', layoutMode: ReportLayoutMode = 'compact') {
  const report = prepareNearDateReport(rows, products)
  const blob = type === 'docx' ? await createNearDateWordBlob(report, date, orientation, printMode, layoutMode) : await createNearDatePdfBlob(report, date, orientation, printMode, layoutMode)
  triggerDownload(blob, `can-date-${fileDate(date)}.${type}`)
}
