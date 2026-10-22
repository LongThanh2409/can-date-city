import ExcelJS from 'exceljs'
import { PACKAGING_TYPE_LABELS, PRODUCT_GROUP_LABELS, defaultPackaging, lotQuantityInPacks, normalizeProduct, parsePackagingType, parseProductGroup, validatePackaging } from '../domain/product'
import type { ComparedProduct, DateRecord, Product } from '../types'

type Cell = string | number | boolean
type Row = Record<string, Cell>

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

async function downloadRows(rows: Row[], name: string, type: 'csv' | 'xlsx') {
  const headers = Object.keys(rows[0] ?? { 'Không có dữ liệu': '' })
  if (type === 'csv') {
    const escape = (value: Cell) => `"${String(value).replaceAll('"', '""')}"`
    const csv = [headers.map(escape).join(','), ...rows.map((row) => headers.map((header) => escape(row[header] ?? '')).join(','))].join('\r\n')
    triggerDownload(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }), `${name}.csv`)
    return
  }
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Dữ liệu')
  sheet.columns = headers.map((header) => ({ header, key: header, width: Math.max(14, Math.min(36, header.length + 4)) }))
  rows.forEach((row) => sheet.addRow(row))
  sheet.getRow(1).font = { bold: true }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  const buffer = await workbook.xlsx.writeBuffer()
  triggerDownload(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${name}.xlsx`)
}

export function exportProducts(products: Product[], type: 'csv' | 'xlsx') {
  return downloadRows(products.map((item) => {
    const product = normalizeProduct(item)
    return { 'Mã sản phẩm': product.productCode, 'Tên sản phẩm': product.productName, 'Tên tiếng Việt': product.vietnameseName, 'Nhóm hàng': PRODUCT_GROUP_LABELS[product.productGroup], 'Kiểu quy cách': PACKAGING_TYPE_LABELS[product.packaging.type], 'Gói/thùng': product.packaging.packsPerCarton ?? '', 'Túi/thùng': product.packaging.bagsPerCarton ?? '', 'Gói/túi': product.packaging.packsPerBag ?? '', 'Túi/rổ': product.packaging.bagsPerBasket ?? '', 'Túi/hộp': product.packaging.bagsPerBox ?? '', 'Gói/hộp': product.packaging.packsPerBox ?? '', 'Ghi chú quy cách': product.packaging.note, 'Từ khóa': product.aliases.join(', '), 'Hoạt động': product.active ? 'Có' : 'Không' }
  }), 'danh-muc-san-pham', type)
}

export async function downloadProductTemplate() {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Chat Cận Date'
  const sheet = workbook.addWorksheet('Danh mục sản phẩm', { views: [{ state: 'frozen', ySplit: 1 }] })
  sheet.columns = [
    { header: 'Mã sản phẩm', key: 'productCode', width: 20 },
    { header: 'Tên sản phẩm', key: 'productName', width: 32 },
    { header: 'Tên tiếng Việt', key: 'vietnameseName', width: 32 },
    { header: 'Nhóm hàng', key: 'productGroup', width: 24 },
    { header: 'Kiểu quy cách', key: 'packagingType', width: 24 },
    { header: 'Gói/thùng', key: 'packsPerCarton', width: 16 },
    { header: 'Túi/thùng', key: 'bagsPerCarton', width: 16 },
    { header: 'Gói/túi', key: 'packsPerBag', width: 16 },
    { header: 'Túi/rổ', key: 'bagsPerBasket', width: 16 },
    { header: 'Túi/hộp', key: 'bagsPerBox', width: 16 },
    { header: 'Gói/hộp', key: 'packsPerBox', width: 16 },
    { header: 'Ghi chú quy cách', key: 'packagingNote', width: 30 },
    { header: 'Từ khóa', key: 'aliases', width: 34 },
    { header: 'Hoạt động', key: 'active', width: 16 },
  ]
  sheet.addRows([
    { productCode: 'SP001', productName: 'Carton only product', vietnameseName: 'Sản phẩm chỉ tính thùng', productGroup: 'Hàng thường', packagingType: 'Chỉ thùng', packagingNote: 'Không quy đổi ra gói', aliases: 'thùng, hàng thường', active: 'Có' },
    { productCode: 'SP002', productName: 'Chilled product', vietnameseName: 'Sản phẩm chill', productGroup: 'Hàng chill', packagingType: 'Rổ → túi → gói', bagsPerBasket: 6, packsPerBag: 10, packagingNote: 'Bảo quản mát', aliases: 'chill, mát', active: 'Có' },
    { productCode: 'SP003', productName: 'Frozen product', vietnameseName: 'Sản phẩm đông lạnh', productGroup: 'Hàng đông lạnh', packagingType: 'Thùng → gói', packsPerCarton: 20, aliases: 'đông, thùng', active: 'Có' },
    { productCode: 'SP004', productName: 'Sterilized sausage bags', vietnameseName: 'Xúc xích hộp túi gói', productGroup: 'Xúc xích tiệt trùng', packagingType: 'Hộp → túi → gói', bagsPerBox: 4, packsPerBag: 8, aliases: 'xúc xích, tiệt trùng', active: 'Có' },
    { productCode: 'SP005', productName: 'Sterilized sausage packs', vietnameseName: 'Xúc xích hộp gói', productGroup: 'Xúc xích tiệt trùng', packagingType: 'Hộp → gói', packsPerBox: 24, aliases: 'xúc xích, hộp', active: 'Có' },
  ])
  const header = sheet.getRow(1)
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }
  header.alignment = { vertical: 'middle' }
  header.height = 24
  sheet.autoFilter = 'A1:N6'
  sheet.getColumn(1).numFmt = '@'
  for (let row = 2; row <= 500; row++) {
    sheet.getCell(`D${row}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Hàng thường,Hàng chill,Xúc xích tiệt trùng,Hàng đông lạnh"'] }
    sheet.getCell(`E${row}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Chỉ thùng,Thùng → gói,Thùng → túi → gói,Rổ / túi,Rổ → túi → gói,Hộp → túi → gói,Hộp → gói"'] }
    sheet.getCell(`N${row}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Có,Không"'] }
  }
  const guide = workbook.addWorksheet('Hướng dẫn')
  guide.columns = [{ width: 24 }, { width: 76 }]
  guide.addRows([
    ['Cột', 'Yêu cầu'],
    ['Mã sản phẩm', 'Bắt buộc, không trùng; nên dùng chữ và số, ví dụ SP001.'],
    ['Tên sản phẩm', 'Không bắt buộc. Có thể bổ sung sau.'],
    ['Tên tiếng Việt', 'Không bắt buộc. Có thể bổ sung sau.'],
    ['Nhóm hàng', 'Không bắt buộc; để trống sẽ dùng Hàng thường. Nếu nhập, chọn một trong: Hàng thường, Hàng chill, Xúc xích tiệt trùng, Hàng đông lạnh.'],
    ['Kiểu quy cách', 'Không bắt buộc; để trống sẽ dùng Chỉ thùng. Nếu nhập, chọn một trong: Chỉ thùng, Thùng → gói, Thùng → túi → gói, Rổ / túi, Rổ → túi → gói, Hộp → túi → gói, Hộp → gói.'],
    ['Các cột số lượng quy cách', 'Không bắt buộc. Nếu nhập thì phải là số nguyên lớn hơn 0; có thể để trống và bổ sung sau.'],
    ['Nhóm hàng và quy cách', 'Độc lập với nhau. Mọi nhóm hàng đều có thể sử dụng bất kỳ kiểu quy cách nào.'],
    ['Ghi chú quy cách', 'Không bắt buộc. Ví dụ: gói 500g, thùng 2 lớp.'],
    ['Từ khóa', 'Không bắt buộc. Nhiều từ khóa cách nhau bằng dấu phẩy hoặc dấu chấm phẩy.'],
    ['Hoạt động', 'Nhập Có hoặc Không. Để trống được hiểu là Có.'],
    ['Lưu ý', 'Giữ nguyên tên các cột ở dòng đầu. Xóa năm dòng mẫu trước khi nhập dữ liệu thật.'],
  ])
  guide.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  guide.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }
  guide.eachRow((row) => { row.alignment = { vertical: 'top', wrapText: true } })
  const buffer = await workbook.xlsx.writeBuffer()
  triggerDownload(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'mau-import-danh-muc-san-pham.xlsx')
}

export function exportDate(records: DateRecord[], date: string, type: 'csv' | 'xlsx', products: Product[] = []) {
  const rows = records.flatMap((record) => {
    const product = products.find((item) => item.id === record.productId)
    return record.lots.map((lot) => ({ 'Ngày chát': record.chatDate, 'Mã sản phẩm': record.productCode, 'Tên sản phẩm (Tên tiếng Việt)': record.vietnameseName, 'Nhóm hàng': product ? PRODUCT_GROUP_LABELS[product.productGroup] : '', 'Quy cách': product ? packagingSummaryForExport(product) : '', 'Ghi chú Sale': record.saleNote ?? '', 'MỚI': record.isNewDate ? 'Có' : 'Không', 'Ngày sản xuất': lot.productionDate, 'Số lượng (gói)': product ? lotQuantityInPacks(lot,product) ?? '' : lot.unit==='gói' ? lot.quantity : '', '% date': lot.datePercent, 'Mã lô/Ghi chú': lot.lotLabel }))
  })
  return downloadRows(rows, `can-date-${date}`, type)
}

const packagingSummaryForExport = (product: Product) => {
  const normalized = normalizeProduct(product)
  if (normalized.packaging.type === 'carton-pack') return `1 thùng = ${normalized.packaging.packsPerCarton ?? ''} gói`
  if (normalized.packaging.type === 'carton-bag-pack') return `1 thùng = ${normalized.packaging.bagsPerCarton ?? ''} túi; 1 túi = ${normalized.packaging.packsPerBag ?? ''} gói`
  if (normalized.packaging.type === 'basket-bag') return normalized.packaging.bagsPerBasket ? `1 rổ = ${normalized.packaging.bagsPerBasket} túi` : 'Đơn vị rổ / túi'
  if (normalized.packaging.type === 'basket-bag-pack') return `1 rổ = ${normalized.packaging.bagsPerBasket ?? ''} túi; 1 túi = ${normalized.packaging.packsPerBag ?? ''} gói`
  if (normalized.packaging.type === 'box-bag-pack') return `1 hộp = ${normalized.packaging.bagsPerBox ?? ''} túi; 1 túi = ${normalized.packaging.packsPerBag ?? ''} gói`
  if (normalized.packaging.type === 'box-pack') return `1 hộp = ${normalized.packaging.packsPerBox ?? ''} gói`
  return 'Chỉ thùng'
}

export function exportComparison(rows: ComparedProduct[], currentDate: string, compareDate: string, type: 'csv' | 'xlsx', products: Product[] = []) {
  const data = rows.flatMap((row) => {
    const product = products.find((item) => item.id === row.productId)
    return row.lots.map((lot) => ({ 'Mã sản phẩm': row.productCode, 'Tên sản phẩm (Tên tiếng Việt)': row.vietnameseName, 'Nhóm hàng': product ? PRODUCT_GROUP_LABELS[product.productGroup] : '', 'Quy cách': product ? packagingSummaryForExport(product) : '', [`NSX ${currentDate}`]: lot.current?.productionDate ?? '', [`SL gói ${currentDate}`]: lot.current && product ? lotQuantityInPacks(lot.current,product) ?? '' : '', [`% date ${currentDate}`]: lot.current?.datePercent ?? '', [`NSX ${compareDate}`]: lot.previous?.productionDate ?? '', [`SL gói ${compareDate}`]: lot.previous && product ? lotQuantityInPacks(lot.previous,product) ?? '' : '', [`% date ${compareDate}`]: lot.previous?.datePercent ?? '', 'Chênh lệch SL': lot.quantityDelta ?? 'Không tính', 'Chênh lệch điểm %': lot.percentDelta ?? '', 'Trạng thái': lot.status }))
  })
  return downloadRows(data, `so-sanh-${currentDate}-voi-${compareDate}`, type)
}

type ParsedProduct = Omit<Product, 'createdAt' | 'updatedAt'> & { error?: string; warning?: string }
const toText = (value: unknown) => String(value ?? '').trim()
const toOptionalNumber = (value: unknown) => toText(value) === '' ? undefined : Number(value)

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i], next = text[i + 1]
    if (char === '"' && quoted && next === '"') { cell += '"'; i++ }
    else if (char === '"') quoted = !quoted
    else if (char === ',' && !quoted) { row.push(cell); cell = '' }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && next === '\n') i++; row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = '' }
    else cell += char
  }
  row.push(cell); if (row.some(Boolean)) rows.push(row)
  const headers = (rows.shift() ?? []).map((header) => header.replace(/^\ufeff/, '').trim())
  return rows.map((values) => Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ''])))
}

export async function parseProductFile(file: File): Promise<ParsedProduct[]> {
  let rows: Record<string, unknown>[]
  if (file.name.toLowerCase().endsWith('.csv')) rows = parseCsv(await file.text())
  else {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await file.arrayBuffer())
    const sheet = workbook.worksheets[0]
    if (!sheet) return []
    const headers = (sheet.getRow(1).values as unknown[]).slice(1).map(toText)
    rows = []
    sheet.eachRow((row, index) => { if (index > 1) { const values = (row.values as unknown[]).slice(1); rows.push(Object.fromEntries(headers.map((header, i) => [header, values[i] ?? '']))) } })
  }
  const seen = new Set<string>()
  return rows.map((row, index) => {
    const code = toText(row['Mã sản phẩm'] ?? row.productCode).toUpperCase()
    const productName = toText(row['Tên sản phẩm'] ?? row.productName)
    const vietnameseName = toText(row['Tên tiếng Việt'] ?? row.vietnameseName)
    const rawGroup = toText(row['Nhóm hàng'] ?? row.productGroup)
    const rawPackagingType = toText(row['Kiểu quy cách'] ?? row.packagingType)
    const productGroup = parseProductGroup(rawGroup)
    const packagingType = parsePackagingType(rawPackagingType)
    const rawPackaging = { ...defaultPackaging(), type: packagingType ?? 'carton-only' as const, packsPerCarton: toOptionalNumber(row['Gói/thùng'] ?? row.packsPerCarton), bagsPerCarton: toOptionalNumber(row['Túi/thùng'] ?? row.bagsPerCarton), packsPerBag: toOptionalNumber(row['Gói/túi'] ?? row.packsPerBag), bagsPerBasket: toOptionalNumber(row['Túi/rổ'] ?? row.bagsPerBasket), bagsPerBox: toOptionalNumber(row['Túi/hộp'] ?? row.bagsPerBox), packsPerBox: toOptionalNumber(row['Gói/hộp'] ?? row.packsPerBox), note: toText(row['Ghi chú quy cách'] ?? row.packagingNote) }
    const resolvedGroup = productGroup ?? 'ambient'
    const packaging = rawPackaging
    const duplicate = seen.has(code); seen.add(code)
    const packagingError = validatePackaging(packaging)[0]
    const error = !code ? `Dòng ${index + 2}: thiếu mã sản phẩm` : duplicate ? `Dòng ${index + 2}: mã trùng trong tệp` : packagingError ? `Dòng ${index + 2}: ${packagingError}` : undefined
    const warnings = [
      !productName ? 'thiếu tên sản phẩm' : '',
      !vietnameseName ? 'thiếu tên tiếng Việt' : '',
      rawGroup && !productGroup ? 'nhóm hàng không nhận diện, đã dùng Hàng thường' : '',
      rawPackagingType && !packagingType ? 'kiểu quy cách không nhận diện, đã dùng Chỉ thùng' : '',
    ].filter(Boolean)
    const warning = warnings.length ? `Dòng ${index + 2}: ${warnings.join('; ')}` : undefined
    return { id: code.toLowerCase().replace(/[^a-z0-9_-]/g, '-'), productCode: code, productName, vietnameseName, productGroup: resolvedGroup, packaging, aliases: toText(row['Từ khóa'] ?? row.aliases).split(/[,;]/).map((value) => value.trim()).filter(Boolean), active: !['không', 'false', '0'].includes(toText(row['Hoạt động'] ?? row.active ?? 'có').toLowerCase()), error, warning }
  })
}
