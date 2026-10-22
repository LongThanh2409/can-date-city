import type { Lot, PackagingType, Product, ProductGroup, ProductPackaging, QuantityBreakdown, QuantityUnitKey } from '../types'

export const PRODUCT_GROUP_LABELS: Record<ProductGroup, string> = {
  ambient: 'Hàng thường',
  chilled: 'Hàng chill',
  'sterilized-sausage': 'Xúc xích tiệt trùng',
  frozen: 'Hàng đông lạnh',
}

export const PACKAGING_TYPE_LABELS: Record<PackagingType, string> = {
  'carton-only': 'Chỉ thùng',
  'carton-pack': 'Thùng → gói',
  'carton-bag-pack': 'Thùng → túi → gói',
  'basket-bag': 'Rổ / túi',
  'basket-bag-pack': 'Rổ → túi → gói',
  'box-bag-pack': 'Hộp → túi → gói',
  'box-pack': 'Hộp → gói',
}

export const defaultPackaging = (): ProductPackaging => ({ type: 'carton-only', note: '' })

export function normalizeProduct(product: Product): Product {
  const productGroup = product.productGroup ?? 'ambient'
  const packaging = { ...defaultPackaging(), ...(product.packaging ?? {}) }
  return {
    ...product,
    productGroup,
    packaging,
  }
}

export function packagingSummary(product: Pick<Product, 'packaging'>): string {
  const packaging = product.packaging ?? defaultPackaging()
  if (packaging.type === 'carton-pack') return packaging.packsPerCarton ? `1 thùng = ${packaging.packsPerCarton} gói` : PACKAGING_TYPE_LABELS[packaging.type]
  if (packaging.type === 'carton-bag-pack') {
    const parts = [packaging.bagsPerCarton ? `1 thùng = ${packaging.bagsPerCarton} túi` : '', packaging.packsPerBag ? `1 túi = ${packaging.packsPerBag} gói` : ''].filter(Boolean)
    return parts.length ? parts.join(' · ') : PACKAGING_TYPE_LABELS[packaging.type]
  }
  if (packaging.type === 'basket-bag') return packaging.bagsPerBasket ? `1 rổ = ${packaging.bagsPerBasket} túi` : 'Đơn vị rổ / túi'
  if (packaging.type === 'basket-bag-pack') return `1 rổ = ${packaging.bagsPerBasket ?? '—'} túi · 1 túi = ${packaging.packsPerBag ?? '—'} gói`
  if (packaging.type === 'box-bag-pack') return `1 hộp = ${packaging.bagsPerBox ?? '—'} túi · 1 túi = ${packaging.packsPerBag ?? '—'} gói`
  if (packaging.type === 'box-pack') return `1 hộp = ${packaging.packsPerBox ?? '—'} gói`
  return packaging.note.trim() ? `Chỉ thùng · ${packaging.note.trim()}` : PACKAGING_TYPE_LABELS[packaging.type]
}

export function validatePackaging(packaging: ProductPackaging): string[] {
  const errors: string[] = []
  const invalidWhenProvided = (value?: number) => value !== undefined && (!Number.isInteger(value) || Number(value) <= 0)
  if (packaging.type === 'carton-pack' && invalidWhenProvided(packaging.packsPerCarton)) errors.push('Số gói trong một thùng phải là số nguyên lớn hơn 0 hoặc để trống.')
  if (packaging.type === 'carton-bag-pack') {
    if (invalidWhenProvided(packaging.bagsPerCarton)) errors.push('Số túi trong một thùng phải là số nguyên lớn hơn 0 hoặc để trống.')
    if (invalidWhenProvided(packaging.packsPerBag)) errors.push('Số gói trong một túi phải là số nguyên lớn hơn 0 hoặc để trống.')
  }
  if (packaging.type === 'basket-bag' && invalidWhenProvided(packaging.bagsPerBasket)) errors.push('Số túi trong một rổ phải là số nguyên lớn hơn 0 hoặc để trống.')
  if (packaging.type === 'basket-bag-pack') {
    if (invalidWhenProvided(packaging.bagsPerBasket)) errors.push('Số túi trong một rổ phải là số nguyên lớn hơn 0 hoặc để trống.')
    if (invalidWhenProvided(packaging.packsPerBag)) errors.push('Số gói trong một túi phải là số nguyên lớn hơn 0 hoặc để trống.')
  }
  if (packaging.type === 'box-bag-pack') {
    if (invalidWhenProvided(packaging.bagsPerBox)) errors.push('Số túi trong một hộp phải là số nguyên lớn hơn 0 hoặc để trống.')
    if (invalidWhenProvided(packaging.packsPerBag)) errors.push('Số gói trong một túi phải là số nguyên lớn hơn 0 hoặc để trống.')
  }
  if (packaging.type === 'box-pack' && invalidWhenProvided(packaging.packsPerBox)) errors.push('Số gói trong một hộp phải là số nguyên lớn hơn 0 hoặc để trống.')
  return errors
}

const normalized = (value: string) => value.trim().toLocaleLowerCase('vi').replaceAll('→', '-').replace(/\s+/g, ' ')

export function parseProductGroup(value: string): ProductGroup | undefined {
  const input = normalized(value)
  if (!input || ['hàng thường', 'thuong', 'thường', 'ambient'].includes(input)) return 'ambient'
  if (['chill', 'hàng chill', 'chilled'].includes(input)) return 'chilled'
  if (['xúc xích tiệt trùng', 'xuc xich tiet trung', 'tiệt trùng', 'sterilized-sausage'].includes(input)) return 'sterilized-sausage'
  if (['đông', 'đông lạnh', 'hàng đông', 'hàng đông lạnh', 'frozen'].includes(input)) return 'frozen'
  return undefined
}

export function parsePackagingType(value: string): PackagingType | undefined {
  const input = normalized(value)
  if (!input || ['chỉ thùng', 'chi thung', 'carton-only'].includes(input)) return 'carton-only'
  if (['thùng - gói', 'thung - goi', 'thùng-gói', 'thung-goi', 'carton-pack'].includes(input)) return 'carton-pack'
  if (['thùng - túi - gói', 'thung - tui - goi', 'thùng-túi-gói', 'thung-tui-goi', 'carton-bag-pack'].includes(input)) return 'carton-bag-pack'
  if (['rổ / túi', 'ro / tui', 'rổ-túi', 'ro-tui', 'rổ - túi', 'basket-bag'].includes(input)) return 'basket-bag'
  if (['rổ - túi - gói', 'ro - tui - goi', 'rổ-túi-gói', 'ro-tui-goi', 'basket-bag-pack'].includes(input)) return 'basket-bag-pack'
  if (['hộp - túi - gói', 'hop - tui - goi', 'hộp-túi-gói', 'hop-tui-goi', 'box-bag-pack'].includes(input)) return 'box-bag-pack'
  if (['hộp - gói', 'hop - goi', 'hộp-gói', 'hop-goi', 'box-pack'].includes(input)) return 'box-pack'
  return undefined
}

export function allowedUnits(product: Pick<Product, 'packaging'>): string[] {
  if (product.packaging.type === 'carton-pack') return ['thùng', 'gói']
  if (product.packaging.type === 'carton-bag-pack') return ['thùng', 'túi', 'gói']
  if (product.packaging.type === 'basket-bag') return ['rổ', 'túi', 'gói']
  if (product.packaging.type === 'basket-bag-pack') return ['rổ', 'túi', 'gói']
  if (product.packaging.type === 'box-bag-pack') return ['hộp', 'túi', 'gói']
  if (product.packaging.type === 'box-pack') return ['hộp', 'gói']
  return ['gói']
}

export interface QuantityEntryUnit {
  key: QuantityUnitKey
  label: string
  packsPerUnit: number
}

export function quantityEntryUnits(product: Pick<Product, 'packaging'>): QuantityEntryUnit[] {
  const packaging = product.packaging
  const units: QuantityEntryUnit[] = []
  if (packaging.type === 'carton-pack' && packaging.packsPerCarton) units.push({ key:'cartons', label:'thùng', packsPerUnit:packaging.packsPerCarton })
  if (packaging.type === 'carton-bag-pack') {
    if (packaging.bagsPerCarton && packaging.packsPerBag) units.push({ key:'cartons', label:'thùng', packsPerUnit:packaging.bagsPerCarton*packaging.packsPerBag })
    if (packaging.packsPerBag) units.push({ key:'bags', label:'túi', packsPerUnit:packaging.packsPerBag })
  }
  if (packaging.type === 'basket-bag-pack') {
    if (packaging.bagsPerBasket && packaging.packsPerBag) units.push({ key:'baskets', label:'rổ', packsPerUnit:packaging.bagsPerBasket*packaging.packsPerBag })
    if (packaging.packsPerBag) units.push({ key:'bags', label:'túi', packsPerUnit:packaging.packsPerBag })
  }
  if (packaging.type === 'box-bag-pack') {
    if (packaging.bagsPerBox && packaging.packsPerBag) units.push({ key:'boxes', label:'hộp', packsPerUnit:packaging.bagsPerBox*packaging.packsPerBag })
    if (packaging.packsPerBag) units.push({ key:'bags', label:'túi', packsPerUnit:packaging.packsPerBag })
  }
  if (packaging.type === 'box-pack' && packaging.packsPerBox) units.push({ key:'boxes', label:'hộp', packsPerUnit:packaging.packsPerBox })
  units.push({ key:'packs', label:'gói', packsPerUnit:1 })
  return units
}

export function quantityBreakdownFromLot(lot: Lot): QuantityBreakdown {
  if (lot.quantityBreakdown) return { ...lot.quantityBreakdown }
  const keyByUnit: Record<string, QuantityUnitKey> = { 'thùng':'cartons', 'rổ':'baskets', 'hộp':'boxes', 'túi':'bags', 'gói':'packs' }
  const key = keyByUnit[lot.unit.trim().toLocaleLowerCase('vi')]
  return key ? { [key]: lot.quantity } : { packs: lot.quantity }
}

export function quantityBreakdownToPacks(breakdown: QuantityBreakdown, product: Pick<Product, 'packaging'>): number | null {
  const factors = new Map(quantityEntryUnits(product).map((unit)=>[unit.key,unit.packsPerUnit]))
  let total = 0
  for (const [key,value] of Object.entries(breakdown) as [QuantityUnitKey,number | undefined][]) {
    if (!value) continue
    if (!Number.isFinite(value) || value < 0) return null
    const factor = factors.get(key)
    if (!factor) return null
    total += value*factor
  }
  return total
}

export function lotQuantityInPacks(lot: Lot, product: Pick<Product, 'packaging'>): number | null {
  return quantityBreakdownToPacks(quantityBreakdownFromLot(lot),product)
}
