import type { Content, ContentText, TableCell, TableCellProperties, TDocumentDefinitions } from 'pdfmake/interfaces'
import { lotQuantityInPacks, packagingSummary, PRODUCT_GROUP_LABELS } from '../domain/product'
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
  productGroup: string
  saleNote: string
  isNewDate: boolean
  lots: NearDateReportLot[]
}

export type ReportOrientation = 'auto' | 'portrait' | 'landscape'
export type ReportPrintMode = 'monochrome' | 'color'
export type ReportLayoutMode = 'optimized' | 'compact' | 'detailed'
export type ReportTuning = { densityLevel: number; fontLevel: number }
export type ReportPageTarget = 2 | 3
export type ReportEmphasisField = 'productCode' | 'productName' | 'saleNote' | 'productionDate' | 'datePercent'
export type ReportEmphasisSuggestion = {
  productCode: string
  fields: Array<'productCode' | 'productName' | 'saleNote'>
  lots: Array<{ productionDate: string; datePercent: number; fields: Array<'productionDate' | 'datePercent'> }>
  reason: string
}
export type ReportEmphasis = string[]

export const DEFAULT_REPORT_TUNING: ReportTuning = { densityLevel: 0, fontLevel: 0 }

export function reportEmphasisKey(productCode: string, field: ReportEmphasisField, productionDate = '', datePercent: number | '' = '') {
  return [productCode,field,productionDate,String(datePercent)].join('|')
}

function emphasized(emphasis: ReportEmphasis, item: NearDateReportProduct, field: ReportEmphasisField, lot?: NearDateReportLot) {
  return emphasis.includes(reportEmphasisKey(item.productCode,field,lot?.productionDate??'',lot?.datePercent??''))
}

type ResolvedReportOrientation = Exclude<ReportOrientation, 'auto'>
type ReportSegment = {
  item: NearDateReportProduct
  lots: NearDateReportLot[]
  continued: boolean
  lotRowHeight?: number
}
type OptimizedLayout = { autoScale: number; segments: ReportSegment[]; pages: ReportSegment[][] }
type PdfMake = typeof import('pdfmake/build/pdfmake')['default']

const BRAND = '115E59'
const BRAND_LIGHT = 'CCFBF1'
const NOTE_FILL = 'FFF7D6'
const NOTE_INK = '713F12'
const BORDER = 'CBD5E1'
const MUTED = '64748B'
const A4_WIDTH = 595.28
const A4_HEIGHT = 841.89
const OPTIMIZED_PAGE_MARGINS: [number, number, number, number] = [10, 12, 10, 15]
// Rows are measured with pdfMake itself, so only a tiny reserve is needed to keep
// the last row from being pushed onto an extra, almost empty page.
const OPTIMIZED_PAGE_RESERVE = 2
const MIN_AUTO_LAYOUT_SCALE = 0.78
const PRODUCT_GROUP_ORDER = ['Hàng đông lạnh', 'Hàng chill', 'Xúc xích tiệt trùng', 'Hàng thường']

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

function groupOrder(label: string) {
  const index = PRODUCT_GROUP_ORDER.indexOf(label)
  return index < 0 ? PRODUCT_GROUP_ORDER.length : index
}

function sortedReportByGroup(report: NearDateReportProduct[]) {
  return report.map((item,index)=>({item,index})).sort((left,right)=>groupOrder(left.item.productGroup)-groupOrder(right.item.productGroup)||left.index-right.index).map(({item})=>item)
}

function groupRowSpans(segments: ReportSegment[]) {
  const spans = new Map<number,number>()
  let offset = 0
  while (offset < segments.length) {
    const label = segments[offset].item.productGroup
    let end = offset
    let rows = 0
    while (end < segments.length && segments[end].item.productGroup === label) {
      rows += segments[end].lots.length
      end += 1
    }
    spans.set(offset,rows)
    offset = end
  }
  return spans
}

function fileDate(date: string) {
  const [year, month, day] = date.split('-')
  return year && month && day ? `${day}-${month}-${year}` : date
}

function numberText(value: number | null) {
  return value === null ? '—' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value)
}

function reportSegments(report: NearDateReportProduct[]): ReportSegment[] {
  const result: ReportSegment[] = []
  report.forEach((item) => {
    const lots = item.lots.length ? item.lots : [{ productionDate: '', quantityPacks: null, datePercent: 0 }]
    for (let offset = 0; offset < lots.length; offset += 8) {
      result.push({ item, lots: lots.slice(offset, offset + 8), continued: offset > 0 })
    }
  })
  return result
}

export function resolveReportOrientation(_report: NearDateReportProduct[], orientation: ReportOrientation, layoutMode: ReportLayoutMode): ResolvedReportOrientation {
  if (layoutMode === 'optimized') return 'portrait'
  if (orientation !== 'auto') return orientation
  return 'portrait'
}

let pdfMakeLoader: Promise<PdfMake> | undefined

function loadPdfMake() {
  pdfMakeLoader ??= Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/fonts/Roboto'),
  ]).then(([{ default: pdfMake }, { default: roboto }]) => {
    pdfMake.addFontContainer(roboto)
    return pdfMake
  })
  return pdfMakeLoader
}

// The date is returned on its own so it can be printed larger: sheets of consecutive days must be told apart at a glance.
function optimizedTitleParts(report: NearDateReportProduct[], date: string) {
  return { label: 'DANH SÁCH HÀNG CẬN DATE  •  ', date: formatDate(date), summary: `  •  ${report.length} mã  •  ${report.reduce((sum, item) => sum + item.lots.length, 0)} dòng NSX` }
}

function optimizedPdfCells(printMode: ReportPrintMode, tuning: ReportTuning, autoScale: number, emphasis: ReportEmphasis) {
  const monochrome = printMode === 'monochrome'
  const { density } = reportTuningFactors(tuning)
  const effectiveDensity = density*autoScale
  const font = (size: number) => Math.round(tunedFontSize(size,tuning)*autoScale*10)/10
  const margin = (value: [number,number,number,number]): [number,number,number,number] => [value[0],value[1]*effectiveDensity,value[2],value[3]*effectiveDensity]
  // Density changes the line spacing as well as the padding, so "Co dòng/Giãn dòng" stays visible.
  const lineHeight = Math.min(1.45, Math.max(1, Math.round(1.18*density*(0.5+autoScale/2)*100)/100))
  const textMargin = margin([2.5,2,2.5,2])
  const lotMargin = margin([1,2,1,2])
  const innerLineWidth = monochrome ? 0.55 : 0.45
  const vLineWidth = (lineIndex: number) => monochrome ? (lineIndex === 0 || lineIndex === 7 ? 0.9 : 0.45) : 0.4
  // A '*' column is sized from the content of the whole table, so a long unbreakable word
  // (a link, a code) gave the note column a different width when measuring every product
  // than when drawing one page. A fixed width keeps note wrapping identical in both passes.
  const fixedWidths = [132, 46, 66, 52, 40]
  const groupWidth = 55
  const tableWidth = A4_WIDTH - OPTIMIZED_PAGE_MARGINS[0] - OPTIMIZED_PAGE_MARGINS[2]
  const noteWidth = tableWidth - [...fixedWidths, groupWidth].reduce((sum, width) => sum + width, 0) - Array.from({ length: 8 }, (_, index) => vLineWidth(index)).reduce((sum, width) => sum + width, 0)
  return {
    innerLineWidth,
    widths: [...fixedWidths, noteWidth, groupWidth] as (number | string)[],
    title: ({ label, date, summary }: ReturnType<typeof optimizedTitleParts>): Content => ({ text: [label, { text: date, fontSize: font(12) }, summary], bold: true, alignment: 'center', color: monochrome ? '#000000' : `#${BRAND}`, fontSize: font(9), margin: [0,0,0,5] }),
    header: (): TableCell[] => ['TÊN SẢN PHẨM', 'MỚI?', 'NSX', 'SL (GÓI)', '%', 'GHI CHÚ SALE', 'NHÓM'].map((label) => pdfCell(label, {
      bold: true,
      color: monochrome ? '#000000' : `#${BRAND}`,
      fillColor: monochrome ? '#E7E7E7' : `#${BRAND_LIGHT}`,
      alignment: 'center',
      fontSize: font(7),
      margin: margin([2,2,2,2]),
    })),
    layout: {
      hLineColor: () => monochrome ? '#000000' : `#${BORDER}`,
      vLineColor: () => monochrome ? '#000000' : `#${BORDER}`,
      hLineWidth: (lineIndex: number) => lineIndex === 0 && monochrome ? 1 : innerLineWidth,
      vLineWidth,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
    name: (item: NearDateReportProduct, continued: boolean, rowSpan: number) => pdfCell([{text:`${item.vietnameseName || item.productName || 'Chưa bổ sung tên'}${continued?' (tiếp)':''}`,bold:emphasized(emphasis,item,'productCode')||emphasized(emphasis,item,'productName'),color:monochrome?'#000000':`#${BRAND}`,fontSize:font(8.8)}],{rowSpan,alignment:'left',fillColor:'#FFFFFF',lineHeight,margin:textMargin}),
    isNew: (item: NearDateReportProduct, rowSpan: number) => pdfCell(item.isNewDate?'CÓ':'KHÔNG',{rowSpan,bold:true,color:monochrome?'#000000':`#${BRAND}`,alignment:'center',fontSize:font(7),lineHeight,margin:lotMargin}),
    productionDate: (item: NearDateReportProduct, lot: NearDateReportLot, id?: string) => pdfCell(lot.productionDate?formatDate(lot.productionDate):'—',{id,bold:emphasized(emphasis,item,'productionDate',lot),alignment:'center',fontSize:font(7.5),lineHeight,margin:lotMargin}),
    quantity: (lot: NearDateReportLot) => pdfCell(pdfQuantity(lot.quantityPacks,font(7.7)),{alignment:'center',lineHeight,margin:lotMargin}),
    datePercent: (item: NearDateReportProduct, lot: NearDateReportLot) => pdfCell(lot.productionDate?`${lot.datePercent}%`:'—',{bold:emphasized(emphasis,item,'datePercent',lot),color:monochrome?'#000000':`#${BRAND}`,alignment:'center',fontSize:font(8.5),lineHeight,margin:lotMargin}),
    note: (item: NearDateReportProduct, rowSpan: number) => pdfCell(item.saleNote||'',{rowSpan,bold:emphasized(emphasis,item,'saleNote'),color:monochrome?'#000000':item.saleNote?'#422006':`#${MUTED}`,alignment:item.saleNote?'left':'center',fillColor:item.saleNote&&!monochrome?`#${NOTE_FILL}`:'#FFFFFF',fontSize:font(7.6),lineHeight,margin:textMargin}),
    group: (label: string, rowSpan: number, border?: [boolean,boolean,boolean,boolean]) => pdfCell(label,{rowSpan,border,bold:true,alignment:'center',fontSize:font(6.5),lineHeight,margin:lotMargin}),
    blank: () => pdfCell('', { fontSize: font(6.5), lineHeight, margin: lotMargin }),
  }
}

function continuedGroupLabel(label: string) {
  return `${label} (tiếp)`
}

// Lays every segment out once on a very tall page and reads back the real row positions.
// This replaces character-count estimates, so pages can be filled right to the bottom.
async function measureOptimizedLayout(pdfMake: PdfMake, report: NearDateReportProduct[], date: string, printMode: ReportPrintMode, tuning: ReportTuning, emphasis: ReportEmphasis, autoScale: number): Promise<OptimizedLayout> {
  const cells = optimizedPdfCells(printMode,tuning,autoScale,emphasis)
  const segments = reportSegments(report)
  const sampleItem = report[0]
  const sampleLot: NearDateReportLot = { productionDate: '2026-12-31', quantityPacks: 88_888, datePercent: 100 }
  const groupLabels = [...new Set(segments.map((segment) => segment.item.productGroup))].flatMap((label) => [label, continuedGroupLabel(label)])
  const probeRow = (id: string, group = ''): TableCell[] => [cells.blank(), cells.blank(), cells.productionDate(sampleItem,sampleLot,id), cells.quantity(sampleLot), cells.datePercent(sampleItem,sampleLot), cells.blank(), group ? cells.group(group,1) : cells.blank()]
  const body: TableCell[][] = [
    cells.header(),
    ...segments.map(({ item, lots, continued }, index) => [cells.name(item,continued,1), cells.isNew(item,1), cells.productionDate(item,lots[0],`segment-${index}`), cells.quantity(lots[0]), cells.datePercent(item,lots[0]), cells.note(item,1), cells.blank()]),
    probeRow('lot'),
    ...groupLabels.map((label, index) => probeRow(`group-${index}`, label)),
    probeRow('end'),
  ]
  const tops = new Map<string, number>()
  await pdfMake.createPdf({
    pageSize: { width: A4_WIDTH, height: Math.max(A4_HEIGHT, body.length * 160) },
    pageMargins: OPTIMIZED_PAGE_MARGINS,
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#0F172A', lineHeight: 1.18 },
    content: [cells.title(optimizedTitleParts(report,date)), { table: { widths: cells.widths, body }, layout: cells.layout } as Content],
    pageBreakBefore: (node) => {
      if (node.id && node.startPosition) tops.set(node.id, node.startPosition.top)
      return false
    },
  }).getBuffer()
  const ids = [...segments.map((_, index) => `segment-${index}`), 'lot', ...groupLabels.map((_, index) => `group-${index}`), 'end']
  const pitch = (index: number) => (tops.get(ids[index + 1]) ?? 0) - (tops.get(ids[index]) ?? 0)
  const lotPitch = pitch(segments.length)
  const groupHeights = new Map(groupLabels.map((label, index) => [label, pitch(segments.length + 1 + index)]))
  const measured = segments.map((segment, index) => {
    // pdfMake gives a row-span cell only the sum of the row heights, without the lines between them.
    const spanHeight = pitch(index) - cells.innerLineWidth
    const lotRowHeight = Math.max(lotPitch - cells.innerLineWidth, spanHeight / segment.lots.length)
    return { ...segment, lotRowHeight: Math.ceil(lotRowHeight * 10) / 10 }
  })
  const segmentHeight = (segment: ReportSegment) => segment.lots.length * ((segment.lotRowHeight ?? 0) + cells.innerLineWidth)
  // The group label sits in the first lot row of each group run; a label taller than
  // that row makes the row grow, so the page height includes the difference.
  const pageHeight = (page: ReportSegment[], previousGroup?: string) => page.reduce((height, segment, index) => {
    const label = segment.item.productGroup
    const runStart = index === 0 || page[index - 1].item.productGroup !== label
    if (!runStart) return height + segmentHeight(segment)
    const groupHeight = groupHeights.get(index === 0 && previousGroup === label ? continuedGroupLabel(label) : label) ?? 0
    return height + segmentHeight(segment) + Math.max(0, groupHeight - (segment.lotRowHeight ?? 0) - cells.innerLineWidth)
  }, 0)
  const available = A4_HEIGHT - OPTIMIZED_PAGE_MARGINS[3] - OPTIMIZED_PAGE_RESERVE - (tops.get(ids[0]) ?? 0)
  const pages: ReportSegment[][] = []
  let page: ReportSegment[] = []
  measured.forEach((segment) => {
    const previousGroup = pages.at(-1)?.at(-1)?.item.productGroup
    if (page.length && pageHeight([...page, segment], previousGroup) > available) {
      pages.push(page)
      page = []
    }
    page.push(segment)
  })
  if (page.length) pages.push(page)
  return { autoScale, segments: measured, pages }
}

async function resolveOptimizedLayout(report: NearDateReportProduct[], date: string, printMode: ReportPrintMode, tuning: ReportTuning, emphasis: ReportEmphasis, pageTarget: ReportPageTarget): Promise<OptimizedLayout> {
  const pdfMake = await loadPdfMake()
  const measure = (autoScale: number) => measureOptimizedLayout(pdfMake,report,date,printMode,tuning,emphasis,autoScale)
  const natural = await measure(1)
  if (natural.pages.length <= pageTarget) return natural
  let best = await measure(MIN_AUTO_LAYOUT_SCALE)
  if (best.pages.length > pageTarget) return best
  // Largest scale that still reaches the page target, so text is only shrunk as much as needed.
  let low = MIN_AUTO_LAYOUT_SCALE
  let high = 1
  while (high - low > 0.015) {
    const middle = Math.round((low + high) * 50) / 100
    const candidate = await measure(middle)
    if (candidate.pages.length <= pageTarget) {
      best = candidate
      low = middle
    } else high = middle
  }
  return best
}

const optimizedLayoutCache = new Map<string, Promise<OptimizedLayout>>()

function cachedOptimizedLayout(report: NearDateReportProduct[], date: string, printMode: ReportPrintMode, tuning: ReportTuning, emphasis: ReportEmphasis, pageTarget: ReportPageTarget) {
  const key = JSON.stringify([report, date, printMode, tuning, [...emphasis].sort(), pageTarget])
  let layout = optimizedLayoutCache.get(key)
  if (!layout) {
    layout = resolveOptimizedLayout(report,date,printMode,tuning,emphasis,pageTarget)
    layout.catch(() => optimizedLayoutCache.delete(key))
    optimizedLayoutCache.set(key, layout)
    if (optimizedLayoutCache.size > 8) optimizedLayoutCache.delete(optimizedLayoutCache.keys().next().value!)
  }
  return layout
}

export async function estimateOptimizedPageCount(report: NearDateReportProduct[], date: string, printMode: ReportPrintMode = 'monochrome', tuning: ReportTuning = DEFAULT_REPORT_TUNING, emphasis: ReportEmphasis = [], pageTarget: ReportPageTarget = 2): Promise<number> {
  if (!report.length) return 1
  return (await cachedOptimizedLayout(sortedReportByGroup(report),date,printMode,tuning,emphasis,pageTarget)).pages.length
}

export function prepareNearDateReport(rows: ComparedProduct[], products: Product[]): NearDateReportProduct[] {
  const prepared = rows.flatMap((row) => {
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
      productGroup: product ? PRODUCT_GROUP_LABELS[product.productGroup] : 'Chưa phân nhóm',
      saleNote: row.current.saleNote?.trim() ?? '',
      isNewDate: row.current.isNewDate,
      lots,
    }]
  })
  return sortedReportByGroup(prepared)
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

export async function createNearDateWordBlob(report: NearDateReportProduct[], date: string, orientation: ReportOrientation = 'auto', printMode: ReportPrintMode = 'monochrome', layoutMode: ReportLayoutMode = 'optimized', tuning: ReportTuning = DEFAULT_REPORT_TUNING, emphasis: ReportEmphasis = [], pageTarget: ReportPageTarget = 2) {
  const {
    AlignmentType,
    BorderStyle,
    Document,
    Footer,
    Header,
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

  report = sortedReportByGroup(report)
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
  // Word ignores "\n" inside a run, so each line of a Sale note becomes its own run after a break.
  const textRuns = (text: string, options: { bold?: boolean; color?: string; size: number }) => text.split('\n').map((line, index) => new TextRun({ text: line, bold: options.bold, color: options.color, size: options.size, font: 'Arial', break: index ? 1 : undefined }))
  const textParagraph = (text: string, options: { bold?: boolean; color?: string; size?: number; align?: typeof AlignmentType[keyof typeof AlignmentType]; keepNext?: boolean } = {}) => new Paragraph({
    alignment: options.align,
    keepNext: options.keepNext,
    spacing: { before: 0, after: 0, line: 276 },
    children: textRuns(text, { bold: options.bold, color: options.color, size: options.size ?? 20 }),
  })
  const quantityParagraph = (value: number | null, options: { size: number; align?: typeof AlignmentType[keyof typeof AlignmentType]; keepNext?: boolean; line?: number }) => new Paragraph({
    alignment: options.align,
    keepNext: options.keepNext,
    spacing: { before:0, after:0, line:options.line ?? 276 },
    children: value === null
      ? [new TextRun({ text:'—', size:options.size, font:'Arial' })]
      : [
        new TextRun({ text:numberText(value), size:options.size, font:'Arial' }),
        new TextRun({ text:' g', size:Math.round(options.size*0.8), color:MUTED, font:'Arial' }),
      ],
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
      children: [
        new TextRun({ text: 'Ngày dữ liệu: ', color: MUTED, size: 20, font: 'Arial' }),
        new TextRun({ text: formatDate(date), bold: true, color: monochrome ? '000000' : BRAND, size: 30, font: 'Arial' }),
        new TextRun({ text: `  •  ${report.length} mã  •  ${report.reduce((sum, item) => sum + item.lots.length, 0)} dòng NSX`, color: MUTED, size: 20, font: 'Arial' }),
      ],
    }),
  ]

  if (!report.length) {
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 300 }, children: [new TextRun({ text: 'Không có dữ liệu phù hợp để xuất.', color: MUTED, size: 24, font: 'Arial' })] }))
  }

  let optimizedHeader: InstanceType<typeof Header> | undefined
  if (layoutMode === 'optimized' && report.length) {
    const layout = await cachedOptimizedLayout(report,date,printMode,tuning,emphasis,pageTarget)
    const { density } = reportTuningFactors(tuning)
    const effectiveDensity = density*layout.autoScale
    const lineHeight = Math.min(1.45, Math.max(1, 1.18*density*(0.5+layout.autoScale/2)))
    const optimizedLine = Math.round(240*lineHeight/1.18)
    const optimizedFontSize = (size: number) => Math.round(tunedFontSize(size,tuning)*layout.autoScale*10)/10
    // Same column widths as the PDF (points × 20), so notes wrap the same way in both files.
    const optimizedWidths = [2640, 920, 1320, 1040, 800, 3680, 1100]
    const optimizedTotal = optimizedWidths.reduce((sum, width) => sum + width, 0)
    const optimizedMargins = { top: Math.round(28*effectiveDensity), bottom: Math.round(28*effectiveDensity), left: 45, right: 45 }
    const optimizedParagraph = (text: string, options: { bold?: boolean; color?: string; size?: number; align?: typeof AlignmentType[keyof typeof AlignmentType]; keepNext?: boolean } = {}) => new Paragraph({
      alignment: options.align,
      keepNext: options.keepNext,
      spacing: { before: 0, after: 0, line: optimizedLine },
      children: textRuns(text, { bold: options.bold, color: options.color, size: optimizedFontSize(options.size ?? 14) }),
    })
    optimizedHeader = new Header({ children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 0 },
      children: (({ label, date: dateText, summary }) => [
        new TextRun({ text: label, bold: true, color: monochrome ? '000000' : BRAND, size: optimizedFontSize(18), font: 'Arial' }),
        new TextRun({ text: dateText, bold: true, color: monochrome ? '000000' : BRAND, size: optimizedFontSize(24), font: 'Arial' }),
        new TextRun({ text: summary, bold: true, color: monochrome ? '000000' : BRAND, size: optimizedFontSize(18), font: 'Arial' }),
      ])(optimizedTitleParts(report,date)),
    })] })
    const productBorder = { style: BorderStyle.SINGLE, size: monochrome ? 12 : 7, color: monochrome ? '000000' : BRAND }
    const segments = layout.segments
    const groupSpans = groupRowSpans(segments)
    // One continuous table: Word repeats the header row and fills every page itself,
    // while keepNext holds the rows of one product together.
    const rows: InstanceType<typeof TableRow>[] = [new TableRow({
      cantSplit: true,
      tableHeader: true,
      children: ['TÊN SẢN PHẨM', 'MỚI?', 'NSX', 'SL (GÓI)', '%', 'GHI CHÚ SALE', 'NHÓM'].map((label, index) => cell([
        optimizedParagraph(label, { bold: true, color: monochrome ? '000000' : BRAND, size: 14, align: AlignmentType.CENTER }),
      ], optimizedWidths[index], { fill: monochrome ? 'E7E7E7' : BRAND_LIGHT, margins: optimizedMargins })),
    })]
    segments.forEach(({ item, lots, continued, lotRowHeight }, segmentIndex) => {
      const rowHeight = Math.ceil((lotRowHeight ?? 12) * 20)
      lots.forEach((lot, lotIndex) => {
        const first = lotIndex === 0
        const last = lotIndex === lots.length - 1
        const keepNext = !last
        const rowBorder = { top: first ? productBorder : border, bottom: last ? productBorder : border, left: border, right: border, insideHorizontal: border, insideVertical: border }
        const rowCells: InstanceType<typeof TableCell>[] = []
        if (first) rowCells.push(cell([
          optimizedParagraph(`${item.vietnameseName || item.productName || 'Chưa bổ sung tên'}${continued ? ' (tiếp)' : ''}`, { bold: emphasized(emphasis,item,'productCode')||emphasized(emphasis,item,'productName'), color: monochrome ? '000000' : BRAND, size: 18, keepNext }),
        ], optimizedWidths[0], { rowSpan: lots.length, verticalAlign: VerticalAlign.TOP, borders: rowBorder, margins: optimizedMargins }))
        if (first) rowCells.push(cell([
          optimizedParagraph(item.isNewDate ? 'CÓ' : 'KHÔNG', { bold: true, color: monochrome ? '000000' : BRAND, size: 13, align: AlignmentType.CENTER, keepNext }),
        ], optimizedWidths[1], { rowSpan: lots.length, borders: rowBorder, margins: optimizedMargins }))
        rowCells.push(
          cell([optimizedParagraph(lot.productionDate ? formatDate(lot.productionDate) : '—', { bold: emphasized(emphasis,item,'productionDate',lot), size: 14, align: AlignmentType.CENTER, keepNext })], optimizedWidths[2], { borders: rowBorder, margins: optimizedMargins }),
          cell([quantityParagraph(lot.quantityPacks, { size:optimizedFontSize(15), align:AlignmentType.CENTER, keepNext, line:optimizedLine })], optimizedWidths[3], { borders: rowBorder, margins: optimizedMargins }),
          cell([optimizedParagraph(lot.productionDate ? `${lot.datePercent}%` : '—', { bold: emphasized(emphasis,item,'datePercent',lot), color: monochrome ? '000000' : BRAND, size: 17, align: AlignmentType.CENTER, keepNext })], optimizedWidths[4], { borders: rowBorder, margins: optimizedMargins }),
        )
        if (first) rowCells.push(cell([
          optimizedParagraph(item.saleNote, { bold: emphasized(emphasis,item,'saleNote'), color: monochrome ? '000000' : '422006', size: item.saleNote ? 15 : 10, keepNext }),
        ], optimizedWidths[5], {
          rowSpan: lots.length,
          verticalAlign: item.saleNote ? VerticalAlign.TOP : VerticalAlign.CENTER,
          fill: item.saleNote && !monochrome ? NOTE_FILL : 'FFFFFF',
          borders: rowBorder,
          margins: optimizedMargins,
        }))
        const groupSpan = groupSpans.get(segmentIndex)
        if (first && groupSpan) rowCells.push(cell([
          optimizedParagraph(item.productGroup, { bold: true, size: 12, align: AlignmentType.CENTER }),
        ], optimizedWidths[6], { rowSpan: groupSpan, borders: rowBorder, margins: optimizedMargins }))
        rows.push(new TableRow({ cantSplit: true, height: { value: rowHeight, rule: HeightRule.ATLEAST }, children: rowCells }))
      })
    })
    children.push(new Table({ width: { size: optimizedTotal, type: WidthType.DXA }, columnWidths: optimizedWidths, layout: TableLayoutType.FIXED, borders, rows }))
  } else if (layoutMode === 'compact' && report.length) {
    const compactWidths = actualOrientation === 'landscape' ? [3400, 1300, 2000, 1600, 1200, 4600, 1200] : [2500, 1000, 1500, 1250, 900, 2310, 1000]
    const compactTotal = compactWidths.reduce((sum, width) => sum + width, 0)
    const compactMargins = { top: 55, bottom: 55, left: 85, right: 85 }
    const compactParagraph = (text: string, options: { bold?: boolean; color?: string; size?: number; align?: typeof AlignmentType[keyof typeof AlignmentType] } = {}) => new Paragraph({
      alignment: options.align,
      spacing: { before: 0, after: 0, line: 220 },
      children: textRuns(text, { bold: options.bold, color: options.color, size: options.size ?? 17 }),
    })
    const productBorder = { style: BorderStyle.SINGLE, size: monochrome ? 14 : 8, color: monochrome ? '000000' : BRAND }
    const compactRows: InstanceType<typeof TableRow>[] = [new TableRow({
      cantSplit: true,
      tableHeader: true,
      children: ['MÃ / TÊN SẢN PHẨM', 'CÓ MỚI?', 'NSX', 'SL (GÓI)', '% DATE', 'GHI CHÚ SALE', 'NHÓM'].map((label, index) => cell([
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
            compactParagraph(item.productCode, { bold: emphasized(emphasis,item,'productCode'), color: monochrome ? '000000' : BRAND, size: 21 }),
            compactParagraph(item.vietnameseName || item.productName || 'Chưa bổ sung tên sản phẩm', { bold: emphasized(emphasis,item,'productName'), size: 17 }),
          ]
          productLines.push(compactParagraph(`QC: ${item.packaging}`, { size: 14, color: MUTED }))
          rowCells.push(cell(productLines, compactWidths[0], { verticalAlign: VerticalAlign.TOP, borders: rowBorder, margins: compactMargins }))
        } else rowCells.push(cell([compactParagraph('')], compactWidths[0], { borders: rowBorder, margins: compactMargins }))
        if (first) rowCells.push(cell([
          compactParagraph(item.isNewDate ? 'CÓ MỚI' : 'KHÔNG CÓ MỚI', { bold: true, color: monochrome ? '000000' : BRAND, size: 15, align: AlignmentType.CENTER }),
        ], compactWidths[1], { rowSpan: lots.length, verticalAlign: VerticalAlign.CENTER, borders: rowBorder, margins: compactMargins }))
        rowCells.push(
          cell([compactParagraph(lot.productionDate ? formatDate(lot.productionDate) : '—', { bold: emphasized(emphasis,item,'productionDate',lot), size: 18, align: AlignmentType.CENTER })], compactWidths[2], { borders: rowBorder, margins: compactMargins }),
          cell([quantityParagraph(lot.quantityPacks, { size:19, align:AlignmentType.CENTER, line:220 })], compactWidths[3], { borders: rowBorder, margins: compactMargins }),
          cell([compactParagraph(lot.productionDate ? `${lot.datePercent}%` : '—', { bold: emphasized(emphasis,item,'datePercent',lot), color: monochrome ? '000000' : BRAND, size: 22, align: AlignmentType.CENTER })], compactWidths[4], { borders: rowBorder, margins: compactMargins }),
        )
        if (first) {
          rowCells.push(cell(item.saleNote ? [
            compactParagraph(item.saleNote, { bold: emphasized(emphasis,item,'saleNote'), color: monochrome ? '000000' : '422006', size: 18 }),
          ] : [compactParagraph('—', { color: MUTED, size: 17, align: AlignmentType.CENTER })], compactWidths[5], {
            verticalAlign: item.saleNote ? VerticalAlign.TOP : VerticalAlign.CENTER,
            fill: item.saleNote && !monochrome ? NOTE_FILL : 'FFFFFF',
            borders: rowBorder,
            margins: compactMargins,
          }))
        } else rowCells.push(cell([compactParagraph('')], compactWidths[5], { borders: rowBorder, margins: compactMargins }))
        if (first) rowCells.push(cell([
          compactParagraph(item.productGroup, { bold: true, size: 14, align: AlignmentType.CENTER }),
        ], compactWidths[6], { rowSpan: lots.length, borders: rowBorder, margins: compactMargins }))
        else rowCells.push(cell([compactParagraph('')], compactWidths[6], { borders: rowBorder, margins: compactMargins }))
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
      `Nhóm: ${item.productGroup}`,
    ]
    const rows = [
      new TableRow({
        cantSplit: true,
        tableHeader: true,
        children: [
          cell([textParagraph(`MÃ: ${item.productCode}`, { bold: emphasized(emphasis,item,'productCode'), color: monochrome ? '000000' : 'FFFFFF', size: monochrome ? 28 : 25, keepNext: true })], codeWidth, { fill: monochrome ? 'FFFFFF' : BRAND }),
          cell(infoLines.map((line, lineIndex) => textParagraph(line, { bold: lineIndex === 0&&emphasized(emphasis,item,'productName'), color: monochrome ? '000000' : 'FFFFFF', size: lineIndex === 0 ? 22 : 18, keepNext: true })), detailWidth, { fill: monochrome ? 'FFFFFF' : BRAND }),
          cell([textParagraph(monochrome ? (item.isNewDate ? '[ CÓ MỚI ]' : '[ KHÔNG CÓ MỚI ]') : (item.isNewDate ? 'CÓ MỚI' : 'KHÔNG CÓ MỚI'), { bold: true, color: monochrome ? '000000' : 'FFFFFF', size: monochrome ? 23 : 21, align: AlignmentType.CENTER, keepNext: true })], stateWidth, { fill: monochrome ? 'FFFFFF' : BRAND }),
        ],
      }),
      new TableRow({
        cantSplit: true,
        tableHeader: true,
        children: [cell([
          textParagraph(monochrome ? 'GHI CHÚ SALE - ƯU TIÊN THỰC HIỆN' : 'GHI CHÚ SALE', { bold: true, color: monochrome ? '000000' : NOTE_INK, size: monochrome ? 20 : 18, keepNext: true }),
          textParagraph(item.saleNote || 'Chưa có ghi chú Sale.', { bold: emphasized(emphasis,item,'saleNote'), color: monochrome ? '000000' : item.saleNote ? '422006' : MUTED, size: item.saleNote ? (monochrome ? 23 : 22) : 19, keepNext: true }),
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
          cell([textParagraph(formatDate(lot.productionDate), { bold: emphasized(emphasis,item,'productionDate',lot), size: monochrome ? 24 : 23, align: AlignmentType.CENTER, keepNext: lotIndex < item.lots.length - 1 })], codeWidth, { fill: monochrome ? 'FFFFFF' : lotIndex % 2 ? 'F8FAFC' : 'FFFFFF' }),
          cell([quantityParagraph(lot.quantityPacks, { size:monochrome ? 25 : 23, align:AlignmentType.CENTER, keepNext:lotIndex < item.lots.length - 1 })], detailWidth, { fill: monochrome ? 'FFFFFF' : lotIndex % 2 ? 'F8FAFC' : 'FFFFFF' }),
          cell([textParagraph(`${lot.datePercent}%`, { bold: emphasized(emphasis,item,'datePercent',lot), color: monochrome ? '000000' : BRAND, size: monochrome ? 29 : 25, align: AlignmentType.CENTER, keepNext: lotIndex < item.lots.length - 1 })], stateWidth, { fill: monochrome ? 'FFFFFF' : lotIndex % 2 ? 'F8FAFC' : 'FFFFFF' }),
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
    title: `Danh sách hàng cận date ${formatDate(date)}${layoutMode === 'optimized' ? ` - mục tiêu ${pageTarget} trang` : ''}`,
    // docx fills the hidden cells under a merged cell with an empty default paragraph. In the
    // optimized layout that paragraph must be tiny, or every lot row grows past the PDF height.
    styles: { default: { document: layoutMode === 'optimized'
      ? { run: { font: 'Arial', size: 2 }, paragraph: { spacing: { before: 0, after: 0, line: 240 } } }
      : { run: { font: 'Arial', size: 20 }, paragraph: { spacing: { after: 80, line: 276 } } } } },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838, orientation: actualOrientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
          margin: layoutMode === 'optimized'
            ? { top: 360, right: 200, bottom: 280, left: 200, header: 100, footer: 100 }
            : { top: 600, right: 720, bottom: 600, left: 720, header: 300, footer: 300 },
        },
      },
      headers: optimizedHeader ? { default: optimizedHeader } : undefined,
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: ['Trang ', PageNumber.CURRENT], color: MUTED, size: 17, font: 'Arial' })] })] }) },
      children,
    }],
  })
  return Packer.toBlob(documentFile)
}

function pdfCell(text: Content, options: Omit<Partial<ContentText & TableCellProperties>, 'text'> & { id?: string } = {}): TableCell {
  return { text, margin: [8, 7, 8, 7], ...options } as ContentText & TableCellProperties
}

function pdfQuantity(value: number | null, fontSize: number): Content {
  if (value === null) return { text:'—', fontSize }
  return [
    { text:numberText(value), fontSize },
    { text:' g', fontSize:Math.round(fontSize*0.8*10)/10, color:`#${MUTED}` },
  ] as Content
}

export async function createNearDatePdfBlob(report: NearDateReportProduct[], date: string, orientation: ReportOrientation = 'auto', printMode: ReportPrintMode = 'monochrome', layoutMode: ReportLayoutMode = 'optimized', tuning: ReportTuning = DEFAULT_REPORT_TUNING, emphasis: ReportEmphasis = [], pageTarget: ReportPageTarget = 2) {
  const pdfMake = await loadPdfMake()
  report = sortedReportByGroup(report)
  const monochrome = printMode === 'monochrome'
  const actualOrientation = resolveReportOrientation(report, orientation, layoutMode)

  const content: Content[] = layoutMode === 'optimized' ? [] : [
    { text: 'DANH SÁCH HÀNG CẬN DATE', style: 'title' },
    { text: ['Ngày dữ liệu: ', { text: formatDate(date), bold: true, fontSize: 15, color: monochrome ? '#000000' : `#${BRAND}` }, `  •  ${report.length} mã  •  ${report.reduce((sum, item) => sum + item.lots.length, 0)} dòng NSX`], style: 'summary' },
  ]
  if (!report.length) content.push({ text: 'Không có dữ liệu phù hợp để xuất.', alignment: 'center', color: `#${MUTED}`, margin: [0, 40, 0, 0] })

  const compactPdfWidths: (number | string)[] = actualOrientation === 'landscape' ? [165, 70, 72, 62, 50, '*', 65] : [125, 55, 68, 55, 42, '*', 60]
  const compactHeaderRow = (): TableCell[] => [
    pdfCell('MÃ / TÊN SẢN PHẨM', { bold: true, color: monochrome ? '#000000' : `#${BRAND}`, fillColor: monochrome ? '#E7E7E7' : `#${BRAND_LIGHT}`, alignment: 'center', fontSize: 8 }),
    pdfCell('CÓ MỚI?', { bold: true, color: monochrome ? '#000000' : `#${BRAND}`, fillColor: monochrome ? '#E7E7E7' : `#${BRAND_LIGHT}`, alignment: 'center', fontSize: 8 }),
    pdfCell('NSX', { bold: true, color: monochrome ? '#000000' : `#${BRAND}`, fillColor: monochrome ? '#E7E7E7' : `#${BRAND_LIGHT}`, alignment: 'center', fontSize: 8 }),
    pdfCell('SL (GÓI)', { bold: true, color: monochrome ? '#000000' : `#${BRAND}`, fillColor: monochrome ? '#E7E7E7' : `#${BRAND_LIGHT}`, alignment: 'center', fontSize: 8 }),
    pdfCell('% DATE', { bold: true, color: monochrome ? '#000000' : `#${BRAND}`, fillColor: monochrome ? '#E7E7E7' : `#${BRAND_LIGHT}`, alignment: 'center', fontSize: 8 }),
    pdfCell('GHI CHÚ SALE', { bold: true, color: monochrome ? '#000000' : `#${BRAND}`, fillColor: monochrome ? '#E7E7E7' : `#${BRAND_LIGHT}`, alignment: 'center', fontSize: 8 }),
    pdfCell('NHÓM', { bold: true, color: monochrome ? '#000000' : `#${BRAND}`, fillColor: monochrome ? '#E7E7E7' : `#${BRAND_LIGHT}`, alignment: 'center', fontSize: 8 }),
  ]
  const compactLayout = {
    hLineColor: () => monochrome ? '#000000' : `#${BORDER}`,
    vLineColor: () => monochrome ? '#000000' : `#${BORDER}`,
    hLineWidth: () => monochrome ? 1.1 : 0.7,
    vLineWidth: (lineIndex: number) => monochrome ? (lineIndex === 0 || lineIndex === 7 ? 1.1 : 0.55) : 0.5,
    paddingLeft: () => 0,
    paddingRight: () => 0,
    paddingTop: () => 0,
    paddingBottom: () => 0,
  }

  if (layoutMode === 'optimized' && report.length) {
    const layout = await cachedOptimizedLayout(report,date,printMode,tuning,emphasis,pageTarget)
    const cells = optimizedPdfCells(printMode,tuning,layout.autoScale,emphasis)
    const buildOptimizedPanel = (segments: ReportSegment[], previousGroup?: string): Content[] => {
      const body: TableCell[][] = [cells.header()]
      const rowHeights: number[] = []
      segments.forEach(({item,lots,continued,lotRowHeight},segmentIndex)=>{
        // pdfMake mis-sizes rows when several row-span cells need extra height at once, so the
        // group column uses one plain cell per lot row with hidden inner borders to look merged.
        const runStart = segmentIndex===0||segments[segmentIndex-1].item.productGroup!==item.productGroup
        const runEnd = segmentIndex===segments.length-1||segments[segmentIndex+1].item.productGroup!==item.productGroup
        const groupLabel = !runStart ? '' : segmentIndex===0&&previousGroup===item.productGroup ? continuedGroupLabel(item.productGroup) : item.productGroup
        lots.forEach((lot,lotIndex)=>{
          const first=lotIndex===0
          body.push([
            first?cells.name(item,continued,lots.length):{},
            first?cells.isNew(item,lots.length):{},
            cells.productionDate(item,lot),
            cells.quantity(lot),
            cells.datePercent(item,lot),
            first?cells.note(item,lots.length):{},
            cells.group(first?groupLabel:'',1,[true,runStart&&first,true,runEnd&&lotIndex===lots.length-1]),
          ])
          rowHeights.push(lotRowHeight ?? 0)
        })
      })
      return [
        cells.title(optimizedTitleParts(report,date)),
        { table: { dontBreakRows:true, widths:cells.widths, heights:(rowIndex:number)=>rowIndex===0?'auto':rowHeights[rowIndex-1], body }, layout:cells.layout, margin:[0,0,0,0] } as Content,
      ]
    }
    layout.pages.forEach((panel, index) => {
      const previousGroup=index>0?layout.pages[index-1][layout.pages[index-1].length-1]?.item.productGroup:undefined
      // The break sits on the panel itself: an empty text node would add a blank line on top.
      content.push({ stack: buildOptimizedPanel(panel,previousGroup), pageBreak: index>0?'before':undefined } as Content)
    })
  } else if (layoutMode === 'compact' && report.length) {
    content.push({ table: { widths: compactPdfWidths, body: [compactHeaderRow()] }, layout: compactLayout, margin: [0, 0, 0, 0] })
    report.forEach((item) => {
      const lots = item.lots.length ? item.lots : [{ productionDate: '', quantityPacks: null, datePercent: 0 }]
      for (let offset = 0; offset < lots.length; offset += 8) {
        const segment = lots.slice(offset, offset + 8)
        const continued = offset > 0
        const productCharsPerLine = actualOrientation === 'landscape' ? 34 : 25
        const noteCharsPerLine = actualOrientation === 'landscape' ? 55 : 28
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
            { text: `${item.productCode}${continued ? ' (tiếp)' : ''}\n`, bold: emphasized(emphasis,item,'productCode'), color: monochrome ? '#000000' : `#${BRAND}`, fontSize: 10 },
            { text: `${item.vietnameseName || item.productName || 'Chưa bổ sung tên sản phẩm'}\n`, bold: emphasized(emphasis,item,'productName'), fontSize: 8.5 },
            { text: `QC: ${item.packaging}`, color: `#${MUTED}`, fontSize: 7 },
          ], { rowSpan: segment.length, alignment: 'left', fillColor: '#FFFFFF', margin: [5, 4, 5, 4] }))
          else row.push({})
          if (first) row.push(pdfCell(item.isNewDate ? 'CÓ MỚI' : 'KHÔNG CÓ MỚI', { rowSpan: segment.length, bold: true, color: monochrome ? '#000000' : `#${BRAND}`, alignment: 'center', fontSize: 8, margin: [3, 4, 3, 4] }))
          else row.push({})
          row.push(
            pdfCell(lot.productionDate ? formatDate(lot.productionDate) : '—', { bold: emphasized(emphasis,item,'productionDate',lot), alignment: 'center', fontSize: 9, margin: [4, 4, 4, 4] }),
            pdfCell(pdfQuantity(lot.quantityPacks,9.5), { alignment: 'center', margin: [4, 4, 4, 4] }),
            pdfCell(lot.productionDate ? `${lot.datePercent}%` : '—', { bold: emphasized(emphasis,item,'datePercent',lot), color: monochrome ? '#000000' : `#${BRAND}`, alignment: 'center', fontSize: 11, margin: [4, 4, 4, 4] }),
          )
          if (first) row.push(pdfCell(item.saleNote ? [
            { text: item.saleNote, bold: emphasized(emphasis,item,'saleNote'), color: monochrome ? '#000000' : '#422006', fontSize: 9 },
          ] : '—', { rowSpan: segment.length, alignment: item.saleNote ? 'left' : 'center', fillColor: item.saleNote && !monochrome ? `#${NOTE_FILL}` : '#FFFFFF', margin: [5, 4, 5, 4] }))
          else row.push({})
          if (first) row.push(pdfCell(item.productGroup, { rowSpan: segment.length, bold: true, alignment: 'center', fontSize: 7, margin: [2, 4, 2, 4] }))
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
    const details = [item.productName || 'Chưa bổ sung tên sản phẩm', item.vietnameseName || 'Chưa bổ sung tên tiếng Việt', `Nhóm: ${item.productGroup}`, `Quy cách: ${item.packaging}`].join('\n')
    const body: TableCell[][] = [
      [
        pdfCell(`MÃ: ${item.productCode}`, { bold: emphasized(emphasis,item,'productCode'), color: monochrome ? '#000000' : '#FFFFFF', fillColor: monochrome ? '#FFFFFF' : `#${BRAND}`, fontSize: monochrome ? 13 : 12 }),
        pdfCell(details, { bold: emphasized(emphasis,item,'productName'), color: monochrome ? '#000000' : '#FFFFFF', fillColor: monochrome ? '#FFFFFF' : `#${BRAND}`, fontSize: 10 }),
        pdfCell(monochrome ? (item.isNewDate ? '[ CÓ MỚI ]' : '[ KHÔNG CÓ MỚI ]') : (item.isNewDate ? 'CÓ MỚI' : 'KHÔNG CÓ MỚI'), { bold: true, color: monochrome ? '#000000' : '#FFFFFF', fillColor: monochrome ? '#FFFFFF' : `#${BRAND}`, alignment: 'center', fontSize: monochrome ? 11 : 10 }),
      ],
      [
        pdfCell([
          { text: monochrome ? 'GHI CHÚ SALE - ƯU TIÊN THỰC HIỆN\n' : 'GHI CHÚ SALE\n', bold: true, color: monochrome ? '#000000' : `#${NOTE_INK}`, fontSize: monochrome ? 10 : 9 },
          { text: item.saleNote || 'Chưa có ghi chú Sale.', bold: emphasized(emphasis,item,'saleNote'), color: monochrome ? '#000000' : item.saleNote ? '#422006' : `#${MUTED}`, fontSize: item.saleNote ? (monochrome ? 12 : 11) : 9 },
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
        pdfCell(formatDate(lot.productionDate), { bold: emphasized(emphasis,item,'productionDate',lot), alignment: 'center', fillColor: monochrome ? '#FFFFFF' : lotIndex % 2 ? '#F8FAFC' : '#FFFFFF', fontSize: monochrome ? 12 : 11 }),
        pdfCell(pdfQuantity(lot.quantityPacks,monochrome ? 12 : 11), { alignment: 'center', fillColor: monochrome ? '#FFFFFF' : lotIndex % 2 ? '#F8FAFC' : '#FFFFFF' }),
        pdfCell(`${lot.datePercent}%`, { bold: emphasized(emphasis,item,'datePercent',lot), color: monochrome ? '#000000' : `#${BRAND}`, alignment: 'center', fillColor: monochrome ? '#FFFFFF' : lotIndex % 2 ? '#F8FAFC' : '#FFFFFF', fontSize: monochrome ? 14 : 12 }),
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
    info: { title: `Danh sách hàng cận date ${formatDate(date)}`, author: 'Chat Cận Date', subject: `Báo cáo cận date dành cho thủ kho${layoutMode === 'optimized' ? ` - mục tiêu ${pageTarget} trang` : ''}` },
    pageSize: 'A4',
    pageOrientation: actualOrientation,
    pageMargins: layoutMode === 'optimized' ? OPTIMIZED_PAGE_MARGINS : [28, 48, 28, 30],
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#0F172A', lineHeight: 1.18 },
    styles: {
      title: { fontSize: 18, bold: true, color: monochrome ? '#000000' : `#${BRAND}`, alignment: 'center', margin: [0, 0, 0, 4] },
      summary: { fontSize: 9, color: `#${MUTED}`, alignment: 'center', margin: [0, 0, 0, 12] },
    },
    header: (currentPage) => layoutMode === 'optimized'
      ? { text: '' }
      : layoutMode === 'compact' && currentPage > 1
      ? { table: { widths: compactPdfWidths, body: [compactHeaderRow()] }, layout: compactLayout, margin: [28, 16, 28, 0] }
      : { text: currentPage > 1 ? `CẬN DATE • ${formatDate(date)}` : '', alignment: 'right', color: `#${MUTED}`, fontSize: 8, margin: [0, 18, 28, 0] },
    footer: (currentPage, pageCount) => ({ text: `Trang ${currentPage}/${pageCount}`, alignment: 'right', color: `#${MUTED}`, fontSize: layoutMode === 'optimized' ? 7 : 8, margin: [0, layoutMode === 'optimized' ? 2 : 6, layoutMode === 'optimized' ? 10 : 28, 0] }),
    content,
  }
  return pdfMake.createPdf(definition).getBlob()
}

export async function exportNearDateReport(rows: ComparedProduct[], date: string, type: 'docx' | 'pdf', products: Product[], orientation: ReportOrientation = 'auto', printMode: ReportPrintMode = 'monochrome', layoutMode: ReportLayoutMode = 'optimized', tuning: ReportTuning = DEFAULT_REPORT_TUNING, emphasis: ReportEmphasis = [], pageTarget: ReportPageTarget = 2) {
  const report = prepareNearDateReport(rows, products)
  const blob = type === 'docx' ? await createNearDateWordBlob(report, date, orientation, printMode, layoutMode,tuning,emphasis,pageTarget) : await createNearDatePdfBlob(report, date, orientation, printMode, layoutMode,tuning,emphasis,pageTarget)
  triggerDownload(blob, `can-date-${fileDate(date)}.${type}`)
}
