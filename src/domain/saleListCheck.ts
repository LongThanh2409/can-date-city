import { formatDate } from '../lib/date'
import { lotQuantityInPacks } from './product'
import type { DateRecord, Product } from '../types'

export interface SaleListLot {
  productionDate: string
  /** Quantity in packs, the unit the table shows; null when the lot cannot be converted. */
  packs: number | null
  /** Raw quantity, used only when it cannot be converted to packs. */
  quantity: number
  unit: string
  datePercent: number
}

export interface SaleListNearDate {
  code: string
  productName: string
  vietnameseName: string
  isNewDate: boolean
  lots: SaleListLot[]
}

export interface SaleListNotNearDate {
  /** The code as Sale wrote it. */
  code: string
  /** Name from the product catalog; empty when the code is not in the catalog. */
  productName: string
  vietnameseName: string
  inCatalog: boolean
}

export interface SaleListCheck {
  /** Distinct codes found in the pasted text. */
  pastedCount: number
  nearDate: SaleListNearDate[]
  notNearDate: SaleListNotNearDate[]
}

/** Codes compare without spaces and case, since Excel cells often carry stray spaces. */
export function normalizeCode(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase()
}

/**
 * Splits a column pasted from Excel into codes, in the order Sale wrote them.
 * When a whole row is pasted, only its first cell is used, so a name column next to the code is ignored.
 */
export function parseSaleCodes(text: string): string[] {
  const seen = new Set<string>()
  const codes: string[] = []
  for (const line of text.split(/[\r\n,;]+/)) {
    const cell = line.split('\t').map((part) => part.trim()).find(Boolean)
    if (!cell) continue
    const key = normalizeCode(cell)
    if (!key || seen.has(key)) continue
    seen.add(key)
    codes.push(cell.replace(/\s+/g, ' '))
  }
  return codes
}

export function checkSaleList(text: string, records: DateRecord[], products: Product[]): SaleListCheck {
  const codes = parseSaleCodes(text)
  const productsById = new Map(products.map((product) => [product.id, product]))
  const productsByCode = new Map<string, Product>()
  products.forEach((product) => productsByCode.set(normalizeCode(product.productCode), product))
  products.forEach((product) => product.aliases?.forEach((alias) => {
    const key = normalizeCode(alias)
    if (key && !productsByCode.has(key)) productsByCode.set(key, product)
  }))
  // Only records that still hold lots belong to the near-date table.
  const recordsByProductId = new Map(records.filter((record) => record.lots.length > 0).map((record) => [record.productId, record]))
  const recordsByCode = new Map(records.filter((record) => record.lots.length > 0).map((record) => [normalizeCode(record.productCode), record]))

  const nearDate: SaleListNearDate[] = []
  const notNearDate: SaleListNotNearDate[] = []
  const shownRecords = new Set<string>()
  for (const code of codes) {
    const key = normalizeCode(code)
    const product = productsByCode.get(key)
    const record = recordsByCode.get(key) ?? (product ? recordsByProductId.get(product.id) : undefined)
    if (!record) {
      notNearDate.push({ code, productName: product?.productName ?? '', vietnameseName: product?.vietnameseName ?? '', inCatalog: Boolean(product) })
      continue
    }
    // A code and its alias can both appear in the list; show the product once.
    if (shownRecords.has(record.id)) continue
    shownRecords.add(record.id)
    const recordProduct = productsById.get(record.productId)
    nearDate.push({
      code: record.productCode,
      productName: record.productName || recordProduct?.productName || '',
      vietnameseName: record.vietnameseName || recordProduct?.vietnameseName || '',
      isNewDate: record.isNewDate,
      lots: [...record.lots].sort((a, b) => a.productionDate.localeCompare(b.productionDate)).map((lot) => ({
        productionDate: lot.productionDate,
        packs: recordProduct ? lotQuantityInPacks(lot, recordProduct) : lot.unit === 'gói' ? lot.quantity : null,
        quantity: lot.quantity,
        unit: lot.unit,
        datePercent: lot.datePercent,
      })),
    })
  }
  return { pastedCount: codes.length, nearDate, notNearDate }
}

const numberFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 })

export function saleListLotText(lot: SaleListLot): string {
  const quantity = lot.packs !== null ? `${numberFormat.format(lot.packs)} gói` : `${numberFormat.format(lot.quantity)} ${lot.unit}`
  return `${quantity} (NSX ${formatDate(lot.productionDate)} – ${lot.datePercent}%)`
}

export function saleListStatusText(isNewDate: boolean): string {
  return isNewDate ? 'Có mới' : 'Không có mới'
}

function displayName(item: { productName: string; vietnameseName: string }): string {
  return item.vietnameseName || item.productName
}

/** Plain text for a chat message to Sale. */
export function saleListMessage(check: SaleListCheck, chatDate: string): string {
  const lines: string[] = []
  if (check.nearDate.length) {
    lines.push(`Các mã đang cận date (${formatDate(chatDate)}):`)
    check.nearDate.forEach((item) => {
      const name = displayName(item)
      lines.push(`- ${item.code}${name ? ` ${name}` : ''} · ${saleListStatusText(item.isNewDate)}`)
      item.lots.forEach((lot) => lines.push(`   + ${saleListLotText(lot)}`))
    })
  }
  if (check.notNearDate.length) {
    if (lines.length) lines.push('')
    lines.push('Các mã không có cận date:')
    check.notNearDate.forEach((item) => {
      const name = displayName(item)
      lines.push(`- ${item.code}${name ? ` ${name}` : ''}`)
    })
  }
  return lines.join('\n')
}
