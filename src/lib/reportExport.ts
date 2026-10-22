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

export type ReportOrientation = 'auto' | 'portrait' | 'landscape'
export type ReportPrintMode = 'monochrome' | 'color'
export type ReportLayoutMode = 'optimized' | 'compact' | 'detailed'
export type ReportTuning = { densityLevel: number; fontLevel: number }

export const DEFAULT_REPORT_TUNING: ReportTuning = { densityLevel: 0, fontLevel: 0 }

type ResolvedReportOrientation = Exclude<ReportOrientation, 'auto'>
type ReportSegment = {
  item: NearDateReportProduct
  lots: NearDateReportLot[]
  continued: boolean
  estimatedHeight: number
}

const BRAND = '115E59'
const BRAND_LIGHT = 'CCFBF1'
const NOTE_FILL = 'FFF7D6'
const NOTE_INK = '713F12'
const BORDER = 'CBD5E1'
const MUTED = '64748B'

function reportTuningFactors(tuning: ReportTuning = DEFAULT_REPORT_TUNING) {
  const densityLevel = Math.max(-2, Math.min(2, Math.round(tuning.densityLevel)))
  const fontLevel = Math.max(-1, Math.min(2, Math.round(tuning.fontLevel)))
  return {
    density: [0.76, 0.88, 1, 1.14, 1.3][densityLevel + 2],
    font: [0.92, 1, 1.1, 1.2][fontLevel + 1],
  }
}

function tunedFontSize(size: number, tuning: ReportTuning) {
  return Math.round(size * reportTuningFactors(tuning).font * 10) / 10
}

function optimizedReportSegments(report: NearDateReportProduct[], narrow: boolean, tuning: ReportTuning) {
  const { density, font } = reportTuningFactors(tuning)
  return reportSegments(report,narrow).map((segment)=>({
    ...segment,
    estimatedHeight: Math.ceil(segment.estimatedHeight*density*font),
  }))
}

function fileDate(date: string) {
  const [year, month, day] = date.split('-')
  return year && month && day ? `${day}-${month}-${year}` : date
}

function numberText(value: number | null) {
  return value === null ? '—' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value)
}

function reportSegments(report: NearDateReportProduct[], narrow: boolean): ReportSegment[] {
  const result: ReportSegment[] = []
  report.forEach((item) => {
    const lots = item.lots.length ? item.lots : [{ productionDate: '', quantityPacks: null, datePercent: 0 }]
    for (let offset = 0; offset < lots.length; offset += 8) {
      const segmentLots = lots.slice(offset, offset + 8)
      const name = item.vietnameseName || item.productName || 'Chưa bổ sung tên sản phẩm'
      const productChars = narrow ? 24 : 32
      const noteChars = narrow ? 34 : 58
      const productLines = Math.max(1, Math.ceil(name.length / productChars))
      const noteLines = item.saleNote ? Math.ceil(item.saleNote.length / noteChars) : 1
      result.push({
        item,
        lots: segmentLots,
        continued: offset > 0,
        estimatedHeight: Math.max(segmentLots.length * 12, productLines * 9 + 5, noteLines * 8 + 5),
      })
    }
  })
  return result
}

export function resolveReportOrientation(_report: NearDateReportProduct[], orientation: ReportOrientation, layoutMode: ReportLayoutMode): ResolvedReportOrientation {
  if (layoutMode === 'optimized') return 'portrait'
  if (orientation !== 'auto') return orientation
  return 'portrait'
}

function paginateReportSegments(segments: ReportSegment[], orientation: ResolvedReportOrientation): ReportSegment[][] {
  if (!segments.length) return [[]]
  const physicalCapacity = orientation === 'landscape' ? 515 : 715
  const maximumPanels = orientation === 'landscape' ? 4 : 2
  const totalHeight = segments.reduce((sum, segment) => sum + segment.estimatedHeight, 0)
  const desiredPanels = Math.min(maximumPanels, Math.max(1, Math.ceil(totalHeight / physicalCapacity)))
  const largest = Math.max(...segments.map((segment) => segment.estimatedHeight))
  // The height estimate deliberately errs on the safe side for long product names and notes.
  // Once all four landscape panels are needed, balancing their estimated height is more
  // accurate than clamping every panel to the conservative single-panel capacity.
  const target = Math.max(largest, totalHeight / desiredPanels * 1.12)
  const panels: ReportSegment[][] = []
  let panel: ReportSegment[] = []
  let height = 0
  segments.forEach((segment) => {
    if (panel.length && height + segment.estimatedHeight > target) {
      panels.push(panel)
      panel = []
      height = 0
    }
    panel.push(segment)
    height += segment.estimatedHeight
  })
  if (panel.length) panels.push(panel)
  return panels
}

function balanceReportSegments(segments: ReportSegment[], requestedPanelCount: number): ReportSegment[][] {
  if (!segments.length) return [[]]
  const panelCount = Math.min(requestedPanelCount, segments.length)
  const panels: ReportSegment[][] = []
  let offset = 0
  let remainingHeight = segments.reduce((sum, segment) => sum + segment.estimatedHeight, 0)
  for (let panelIndex = 0; panelIndex < panelCount - 1; panelIndex += 1) {
    const remainingPanels = panelCount - panelIndex
    const target = remainingHeight / remainingPanels
    const lastAllowedOffset = segments.length - (remainingPanels - 1)
    let height = 0
    let end = offset
    while (end < lastAllowedOffset) {
      const nextHeight = segments[end].estimatedHeight
      if (end > offset && Math.abs(target - height) <= Math.abs(target - height - nextHeight)) break
      height += nextHeight
      end += 1
    }
    panels.push(segments.slice(offset, end))
    offset = end
    remainingHeight -= height
  }
  panels.push(segments.slice(offset))
  return panels
}

function paginateOptimizedPortrait(segments: ReportSegment[]): ReportSegment[][] {
  if (!segments.length) return [[]]
  const pageCapacity = 580
  const totalHeight = segments.reduce((sum, segment) => sum + segment.estimatedHeight, 0)
  if (totalHeight <= pageCapacity) return [segments]
  return balanceReportSegments(segments,Math.max(2,Math.ceil(totalHeight/pageCapacity)))
}

export function estimateOptimizedPageCount(report: NearDateReportProduct[], orientation: ReportOrientation, tuning: ReportTuning = DEFAULT_REPORT_TUNING): number {
  const actualOrientation = resolveReportOrientation(report, orientation, 'optimized')
  if (actualOrientation === 'portrait') {
    const totalHeight = optimizedReportSegments(report,false,tuning).reduce((sum, segment) => sum + segment.estimatedHeight, 0)
    return Math.max(1, Math.ceil(totalHeight / 580))
  }
  const portraitEstimate = optimizedReportSegments(report,false,tuning).reduce((sum, segment) => sum + segment.estimatedHeight, 0)
  if (portraitEstimate > 2_000) {
    const denseHeight = reportSegments(report, true).reduce((sum, { item, lots }) => {
      const productLines = 1
        + Math.ceil((item.vietnameseName || item.productName || 'Chưa bổ sung tên').length / 30)
        + Math.ceil((4 + item.packaging.length) / 33)
      const noteLines = item.saleNote ? Math.ceil(item.saleNote.length / 52) : 1
      return sum + Math.max(lots.length * 7.5, productLines * 6.8 + 2, noteLines * 6.8 + 2)
    }, 0)
    return Math.max(1, Math.ceil(denseHeight / 1_000))
  }
  const totalHeight = optimizedReportSegments(report,true,tuning).reduce((sum, segment) => sum + segment.estimatedHeight, 0)
  return Math.max(1, Math.ceil(totalHeight / (515 * 2)))
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

export async function createNearDateWordBlob(report: NearDateReportProduct[], date: string, orientation: ReportOrientation = 'auto', printMode: ReportPrintMode = 'monochrome', layoutMode: ReportLayoutMode = 'optimized', tuning: ReportTuning = DEFAULT_REPORT_TUNING) {
  const {
    AlignmentType,
    BorderStyle,
    Document,
    Footer,
    HeightRule,
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
  const actualOrientation = resolveReportOrientation(report, orientation, layoutMode)
  const border = { style: BorderStyle.SINGLE, size: monochrome ? 8 : 4, color: monochrome ? '000000' : BORDER }
  const emphasisBorder = { style: BorderStyle.SINGLE, size: 16, color: '000000' }
  const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border }
  const cellMargins = { top: 100, bottom: 100, left: 140, right: 140 }
  const columnWidths = actualOrientation === 'landscape' ? [3800, 7300, 4200] : [2700, 5000, 2760]
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

  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = layoutMode === 'optimized' ? [] : [
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

  if (layoutMode === 'optimized' && report.length) {
    const tuningFactors = reportTuningFactors(tuning)
    const narrow = actualOrientation === 'landscape'
    const portraitEstimate = reportSegments(report, false).reduce((sum, segment) => sum + segment.estimatedHeight, 0)
    const denseLandscape = narrow && portraitEstimate > 2_000
    const optimizedWidths = denseLandscape
      ? [1900, 600, 1000, 750, 550, 3300]
      : narrow ? [1700, 700, 1100, 900, 700, 3000] : [2800, 1000, 1500, 1200, 900, 4052]
    const optimizedTotal = optimizedWidths.reduce((sum, width) => sum + width, 0)
    const optimizedMargins = denseLandscape
      ? { top: Math.round(12*tuningFactors.density), bottom: Math.round(12*tuningFactors.density), left: 24, right: 24 }
      : { top: Math.round(28*tuningFactors.density), bottom: Math.round(28*tuningFactors.density), left: 45, right: 45 }
    const optimizedParagraph = (text: string, options: { bold?: boolean; color?: string; size?: number; align?: typeof AlignmentType[keyof typeof AlignmentType] } = {}) => new Paragraph({
      alignment: options.align,
      spacing: { before: 0, after: 0, line: Math.round(240*tuningFactors.density) },
      children: [new TextRun({ text, bold: options.bold, color: options.color, size: tunedFontSize(options.size ?? 14,tuning), font: 'Arial' })],
    })
    const optimizedPageTitle = () => new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 45 },
      children: [new TextRun({
        text: `DANH SÁCH HÀNG CẬN DATE  •  ${formatDate(date)}  •  ${report.length} mã  •  ${report.reduce((sum, item) => sum + item.lots.length, 0)} dòng NSX`,
        bold: true,
        color: monochrome ? '000000' : BRAND,
        size: tunedFontSize(15,tuning),
        font: 'Arial',
      })],
    })
    const productBorder = { style: BorderStyle.SINGLE, size: monochrome ? 12 : 7, color: monochrome ? '000000' : BRAND }
    const buildPanelTable = (segments: ReportSegment[]) => {
      const rows: InstanceType<typeof TableRow>[] = [new TableRow({
        cantSplit: true,
        tableHeader: true,
        children: ['TÊN SẢN PHẨM', 'MỚI?', 'NSX', 'SL', '%', 'GHI CHÚ SALE'].map((label, index) => cell([
          optimizedParagraph(label, { bold: true, color: monochrome ? '000000' : BRAND, size: denseLandscape ? 12 : narrow ? 12 : 14, align: AlignmentType.CENTER }),
        ], optimizedWidths[index], { fill: monochrome ? 'E7E7E7' : BRAND_LIGHT, margins: optimizedMargins })),
      })]
      segments.forEach(({ item, lots, continued, estimatedHeight }) => {
        const denseProductLines = 1
          + Math.ceil((item.vietnameseName || item.productName || 'Chưa bổ sung tên').length / 30)
          + Math.ceil((4 + item.packaging.length) / 33)
        const denseNoteLines = item.saleNote ? Math.ceil(item.saleNote.length / 48) : 1
        const denseGroupHeight = Math.max(lots.length * 180, denseProductLines * 170 + 48, denseNoteLines * 170 + 48)
        const rowHeight = denseLandscape
          ? Math.ceil(denseGroupHeight / lots.length)
          : Math.ceil(estimatedHeight * 20 / lots.length)
        lots.forEach((lot, lotIndex) => {
          const first = lotIndex === 0
          const last = lotIndex === lots.length - 1
          const rowBorder = { top: first ? productBorder : border, bottom: last ? productBorder : border, left: border, right: border, insideHorizontal: border, insideVertical: border }
          const rowCells: InstanceType<typeof TableCell>[] = []
          if (first) rowCells.push(cell([
            optimizedParagraph(`${item.vietnameseName || item.productName || 'Chưa bổ sung tên'}${continued ? ' (tiếp)' : ''}`, { bold: true, color: monochrome ? '000000' : BRAND, size: denseLandscape ? 13 : narrow ? 15 : 18 }),
          ], optimizedWidths[0], { rowSpan: lots.length, verticalAlign: VerticalAlign.TOP, borders: rowBorder, margins: optimizedMargins }))
          if (first) rowCells.push(cell([
            optimizedParagraph(item.isNewDate ? 'CÓ' : 'KHÔNG', { bold: true, color: monochrome ? '000000' : BRAND, size: denseLandscape ? 11 : narrow ? 12 : 13, align: AlignmentType.CENTER }),
          ], optimizedWidths[1], { rowSpan: lots.length, borders: rowBorder, margins: optimizedMargins }))
          rowCells.push(
            cell([optimizedParagraph(lot.productionDate ? formatDate(lot.productionDate) : '—', { bold: true, size: denseLandscape ? 11 : narrow ? 12 : 14, align: AlignmentType.CENTER })], optimizedWidths[2], { borders: rowBorder, margins: optimizedMargins }),
            cell([optimizedParagraph(numberText(lot.quantityPacks), { bold: true, size: denseLandscape ? 12 : narrow ? 13 : 15, align: AlignmentType.CENTER })], optimizedWidths[3], { borders: rowBorder, margins: optimizedMargins }),
            cell([optimizedParagraph(lot.productionDate ? `${lot.datePercent}%` : '—', { bold: true, color: monochrome ? '000000' : BRAND, size: denseLandscape ? 13 : narrow ? 15 : 17, align: AlignmentType.CENTER })], optimizedWidths[4], { borders: rowBorder, margins: optimizedMargins }),
          )
          if (first) rowCells.push(cell(item.saleNote ? [
            optimizedParagraph(item.saleNote, { bold: true, color: monochrome ? '000000' : '422006', size: denseLandscape ? 12 : narrow ? 13 : 15 }),
          ] : [optimizedParagraph('', { size: 10 })], optimizedWidths[5], {
            rowSpan: lots.length,
            verticalAlign: item.saleNote ? VerticalAlign.TOP : VerticalAlign.CENTER,
            fill: item.saleNote && !monochrome ? NOTE_FILL : 'FFFFFF',
            borders: rowBorder,
            margins: optimizedMargins,
          }))
          rows.push(new TableRow({ cantSplit: true, height: { value: rowHeight, rule: HeightRule.ATLEAST }, children: rowCells }))
        })
      })
      return new Table({ width: { size: optimizedTotal, type: WidthType.DXA }, columnWidths: optimizedWidths, layout: TableLayoutType.FIXED, borders, rows })
    }
    const tunedSegments = optimizedReportSegments(report,narrow,tuning)
    const panels = denseLandscape
      ? balanceReportSegments(tunedSegments, 4)
      : narrow
        ? paginateReportSegments(tunedSegments, actualOrientation)
        : paginateOptimizedPortrait(tunedSegments)
    if (actualOrientation === 'landscape') {
      const panelWidth = optimizedTotal
      const gap = 184
      for (let index = 0; index < panels.length; index += 2) {
        if (index > 0) children.push(new Paragraph({ pageBreakBefore: true, spacing: { before: 0, after: 0 }, children: [] }))
        children.push(optimizedPageTitle())
        const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
        children.push(new Table({
          width: { size: panelWidth * 2 + gap, type: WidthType.DXA },
          columnWidths: [panelWidth, gap, panelWidth],
          layout: TableLayoutType.FIXED,
          borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder },
          rows: [new TableRow({ cantSplit: true, children: [
            new TableCell({ width: { size: panelWidth, type: WidthType.DXA }, margins: { top: 0, bottom: 0, left: 0, right: 0 }, borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder }, children: [buildPanelTable(panels[index])] }),
            new TableCell({ width: { size: gap, type: WidthType.DXA }, margins: { top: 0, bottom: 0, left: 0, right: 0 }, borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder }, children: [new Paragraph('')] }),
            new TableCell({ width: { size: panelWidth, type: WidthType.DXA }, margins: { top: 0, bottom: 0, left: 0, right: 0 }, borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder }, children: panels[index + 1] ? [buildPanelTable(panels[index + 1])] : [new Paragraph('')] }),
          ] })],
        }))
      }
    } else panels.forEach((panel, index) => {
      if (index > 0) children.push(new Paragraph({ pageBreakBefore: true, spacing: { before: 0, after: 0 }, children: [] }))
      children.push(optimizedPageTitle())
      children.push(buildPanelTable(panel))
    })
  } else if (layoutMode === 'compact' && report.length) {
    const compactWidths = actualOrientation === 'landscape' ? [3400, 1300, 2000, 1600, 1200, 5800] : [2500, 1000, 1500, 1250, 900, 3310]
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
          size: { width: 11906, height: 16838, orientation: actualOrientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
          margin: layoutMode === 'optimized'
            ? { top: 360, right: 227, bottom: 300, left: 227, header: 100, footer: 100 }
            : { top: 600, right: 720, bottom: 600, left: 720, header: 300, footer: 300 },
        },
      },
      headers: undefined,
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: ['Trang ', PageNumber.CURRENT], color: MUTED, size: 17, font: 'Arial' })] })] }) },
      children,
    }],
  })
  return Packer.toBlob(documentFile)
}

function pdfCell(text: Content, options: Omit<Partial<ContentText & TableCellProperties>, 'text'> = {}): TableCell {
  return { text, margin: [8, 7, 8, 7], ...options } as ContentText & TableCellProperties
}

export async function createNearDatePdfBlob(report: NearDateReportProduct[], date: string, orientation: ReportOrientation = 'auto', printMode: ReportPrintMode = 'monochrome', layoutMode: ReportLayoutMode = 'optimized', tuning: ReportTuning = DEFAULT_REPORT_TUNING) {
  const [{ default: pdfMake }, { default: roboto }] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/fonts/Roboto'),
  ])
  pdfMake.addFontContainer(roboto)
  const monochrome = printMode === 'monochrome'
  const actualOrientation = resolveReportOrientation(report, orientation, layoutMode)

  const content: Content[] = layoutMode === 'optimized' ? [] : [
    { text: 'DANH SÁCH HÀNG CẬN DATE', style: 'title' },
    { text: `Ngày dữ liệu: ${formatDate(date)}  •  ${report.length} mã  •  ${report.reduce((sum, item) => sum + item.lots.length, 0)} dòng NSX`, style: 'summary' },
  ]
  if (!report.length) content.push({ text: 'Không có dữ liệu phù hợp để xuất.', alignment: 'center', color: `#${MUTED}`, margin: [0, 40, 0, 0] })

  const compactPdfWidths: (number | string)[] = actualOrientation === 'landscape' ? [165, 70, 72, 62, 50, '*'] : [125, 55, 68, 55, 42, '*']
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

  if (layoutMode === 'optimized' && report.length) {
    const tuningFactors = reportTuningFactors(tuning)
    const optimizedFont = (size: number) => tunedFontSize(size,tuning)
    const optimizedMargin = (margin: [number,number,number,number]): [number,number,number,number] => [margin[0],margin[1]*tuningFactors.density,margin[2],margin[3]*tuningFactors.density]
    const narrow = actualOrientation === 'landscape'
    const portraitEstimate = reportSegments(report, false).reduce((sum, segment) => sum + segment.estimatedHeight, 0)
    const denseLandscape = narrow && portraitEstimate > 2_000
    const optimizedWidths: (number | string)[] = denseLandscape ? [96, 30, 50, 36, 28, '*'] : narrow ? [84, 34, 52, 40, 32, '*'] : [132, 46, 66, 52, 40, '*']
    const optimizedHeaderRow = (): TableCell[] => ['TÊN SẢN PHẨM', 'MỚI?', 'NSX', 'SL', '%', 'GHI CHÚ SALE'].map((label) => pdfCell(label, {
      bold: true,
      color: monochrome ? '#000000' : `#${BRAND}`,
      fillColor: monochrome ? '#E7E7E7' : `#${BRAND_LIGHT}`,
      alignment: 'center',
      fontSize: optimizedFont(denseLandscape ? 5.8 : narrow ? 6.2 : 7),
      margin: optimizedMargin(denseLandscape ? [1,1,1,1] : [2,2,2,2]),
    }))
    const optimizedLayout = {
      hLineColor: () => monochrome ? '#000000' : `#${BORDER}`,
      vLineColor: () => monochrome ? '#000000' : `#${BORDER}`,
      hLineWidth: (lineIndex: number) => monochrome ? (lineIndex === 0 ? 1 : 0.55) : 0.45,
      vLineWidth: (lineIndex: number) => monochrome ? (lineIndex === 0 || lineIndex === 6 ? 0.9 : 0.45) : 0.4,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    }
    const buildOptimizedSegment = ({ item, lots, continued }: ReportSegment): Content => {
      const displayName = item.vietnameseName || item.productName || 'Chưa bổ sung tên'
      const productLines = Math.max(1, Math.ceil((displayName.length + (continued ? 7 : 0)) / (narrow ? 20 : 30)))
      const noteLines = item.saleNote ? Math.ceil(item.saleNote.length / (narrow ? 38 : 58)) : 1
      const requiredHeight = Math.max(lots.length*(narrow?9:11),productLines*(narrow?8:10)+4,noteLines*(narrow?8:9)+4)*tuningFactors.density*tuningFactors.font
      const rowHeight = Math.ceil(requiredHeight / lots.length)
      const denseProductLines = 1
        + Math.ceil((item.vietnameseName || item.productName || 'Chưa bổ sung tên').length / 30)
        + Math.ceil((4 + item.packaging.length) / 33)
      const denseNoteLines = item.saleNote ? Math.ceil(item.saleNote.length / 52) : 1
      const denseRowHeight = Math.ceil(Math.max(lots.length*7.5,denseProductLines*6.8+2,denseNoteLines*6.8+2)*tuningFactors.density*tuningFactors.font/lots.length)
      const body: TableCell[][] = lots.map((lot, lotIndex) => {
        const first = lotIndex === 0
        const row: TableCell[] = []
        if (first) row.push(pdfCell([
          { text: `${displayName}${continued ? ' (tiếp)' : ''}`, bold: true, color: monochrome ? '#000000' : `#${BRAND}`, fontSize: optimizedFont(denseLandscape ? 6.6 : narrow ? 7.8 : 8.8) },
        ], { rowSpan: lots.length, alignment: 'left', fillColor: '#FFFFFF', margin: optimizedMargin(denseLandscape ? [1.5,0.7,1.5,0.7] : [2.5,2,2.5,2]) }))
        else row.push({})
        if (first) row.push(pdfCell(item.isNewDate ? 'CÓ' : 'KHÔNG', { rowSpan: lots.length, bold: true, color: monochrome ? '#000000' : `#${BRAND}`, alignment: 'center', fontSize: optimizedFont(denseLandscape ? 5.7 : narrow ? 6.4 : 7), margin: optimizedMargin(denseLandscape ? [0.5,0.7,0.5,0.7] : [1,2,1,2]) }))
        else row.push({})
        row.push(
          pdfCell(lot.productionDate ? formatDate(lot.productionDate) : '—', { bold: true, alignment: 'center', fontSize: optimizedFont(denseLandscape ? 5.7 : narrow ? 6.6 : 7.5), margin: optimizedMargin(denseLandscape ? [0.5,0.7,0.5,0.7] : [1,2,1,2]) }),
          pdfCell(numberText(lot.quantityPacks), { bold: true, alignment: 'center', fontSize: optimizedFont(denseLandscape ? 5.9 : narrow ? 6.8 : 7.7), margin: optimizedMargin(denseLandscape ? [0.5,0.7,0.5,0.7] : [1,2,1,2]) }),
          pdfCell(lot.productionDate ? `${lot.datePercent}%` : '—', { bold: true, color: monochrome ? '#000000' : `#${BRAND}`, alignment: 'center', fontSize: optimizedFont(denseLandscape ? 6.4 : narrow ? 7.6 : 8.5), margin: optimizedMargin(denseLandscape ? [0.5,0.7,0.5,0.7] : [1,2,1,2]) }),
        )
        if (first) row.push(pdfCell(item.saleNote || '', {
          rowSpan: lots.length,
          bold: Boolean(item.saleNote),
          color: monochrome ? '#000000' : item.saleNote ? '#422006' : `#${MUTED}`,
          alignment: item.saleNote ? 'left' : 'center',
          fillColor: item.saleNote && !monochrome ? `#${NOTE_FILL}` : '#FFFFFF',
          fontSize: optimizedFont(denseLandscape ? 5.8 : narrow ? 6.8 : 7.6),
          margin: optimizedMargin(denseLandscape ? [1.5,0.7,1.5,0.7] : [2.5,2,2.5,2]),
        }))
        else row.push({})
        return row
      })
      const table = { dontBreakRows: true, widths: optimizedWidths, heights: denseLandscape ? denseRowHeight : rowHeight, body }
      return { table, layout: optimizedLayout, unbreakable: true, margin: [0, 0, 0, 0] }
    }
    const tunedSegments = optimizedReportSegments(report,narrow,tuning)
    const panels = denseLandscape
      ? balanceReportSegments(tunedSegments, 4)
      : narrow
        ? paginateReportSegments(tunedSegments, actualOrientation)
        : paginateOptimizedPortrait(tunedSegments)
    const panelStack = (segments: ReportSegment[]): Content[] => [
      { table: { widths: optimizedWidths, body: [optimizedHeaderRow()] }, layout: optimizedLayout, margin: [0, 0, 0, 0] },
      ...segments.map(buildOptimizedSegment),
    ]
    if (actualOrientation === 'landscape') {
      for (let index = 0; index < panels.length; index += 2) {
        content.push({
          columns: [
            { width: '*', stack: panelStack(panels[index]) },
            { width: '*', stack: panels[index + 1] ? panelStack(panels[index + 1]) : [] },
          ],
          columnGap: 7,
          pageBreak: index > 0 ? 'before' : undefined,
        } as Content)
      }
    } else panels.forEach((panel, index) => content.push({
      stack: panelStack(panel),
      pageBreak: index > 0 ? 'before' : undefined,
    } as Content))
  } else if (layoutMode === 'compact' && report.length) {
    content.push({ table: { widths: compactPdfWidths, body: [compactHeaderRow()] }, layout: compactLayout, margin: [0, 0, 0, 0] })
    report.forEach((item) => {
      const lots = item.lots.length ? item.lots : [{ productionDate: '', quantityPacks: null, datePercent: 0 }]
      for (let offset = 0; offset < lots.length; offset += 8) {
        const segment = lots.slice(offset, offset + 8)
        const continued = offset > 0
        const productCharsPerLine = actualOrientation === 'landscape' ? 34 : 25
        const noteCharsPerLine = actualOrientation === 'landscape' ? 70 : 38
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
      table: { headerRows: 3, keepWithHeaderRows: 1, dontBreakRows: true, widths: actualOrientation === 'landscape' ? [140, '*', 100] : [105, '*', 75], body },
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
    pageOrientation: actualOrientation,
    pageMargins: layoutMode === 'optimized' ? [12, 27, 12, 16] : [28, 48, 28, 30],
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#0F172A', lineHeight: 1.18 },
    styles: {
      title: { fontSize: 18, bold: true, color: monochrome ? '#000000' : `#${BRAND}`, alignment: 'center', margin: [0, 0, 0, 4] },
      summary: { fontSize: 9, color: `#${MUTED}`, alignment: 'center', margin: [0, 0, 0, 12] },
    },
    header: (currentPage) => layoutMode === 'optimized'
      ? { text: `DANH SÁCH HÀNG CẬN DATE  •  ${formatDate(date)}  •  ${report.length} mã  •  ${report.reduce((sum, item) => sum + item.lots.length, 0)} dòng NSX`, bold: true, alignment: 'center', color: monochrome ? '#000000' : `#${BRAND}`, fontSize: tunedFontSize(7.5,tuning), margin: [12, 7, 12, 0] }
      : layoutMode === 'compact' && currentPage > 1
      ? { table: { widths: compactPdfWidths, body: [compactHeaderRow()] }, layout: compactLayout, margin: [28, 16, 28, 0] }
      : { text: currentPage > 1 ? `CẬN DATE • ${formatDate(date)}` : '', alignment: 'right', color: `#${MUTED}`, fontSize: 8, margin: [0, 18, 28, 0] },
    footer: (currentPage, pageCount) => ({ text: `Trang ${currentPage}/${pageCount}`, alignment: 'right', color: `#${MUTED}`, fontSize: layoutMode === 'optimized' ? 7 : 8, margin: [0, layoutMode === 'optimized' ? 2 : 6, layoutMode === 'optimized' ? 12 : 28, 0] }),
    content,
  }
  return pdfMake.createPdf(definition).getBlob()
}

export async function exportNearDateReport(rows: ComparedProduct[], date: string, type: 'docx' | 'pdf', products: Product[], orientation: ReportOrientation = 'auto', printMode: ReportPrintMode = 'monochrome', layoutMode: ReportLayoutMode = 'optimized', tuning: ReportTuning = DEFAULT_REPORT_TUNING) {
  const report = prepareNearDateReport(rows, products)
  const blob = type === 'docx' ? await createNearDateWordBlob(report, date, orientation, printMode, layoutMode,tuning) : await createNearDatePdfBlob(report, date, orientation, printMode, layoutMode,tuning)
  triggerDownload(blob, `can-date-${fileDate(date)}.${type}`)
}
