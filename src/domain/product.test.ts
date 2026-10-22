import { describe, expect, it } from 'vitest'
import { allowedUnits, lotQuantityInPacks, normalizeProduct, packagingSummary, parsePackagingType, parseProductGroup, quantityBreakdownToPacks, quantityEntryUnits, validatePackaging } from './product'
import type { Product } from '../types'

describe('product packaging', () => {
  it('gán mặc định an toàn cho sản phẩm cũ', () => {
    const legacy = { id:'a', productCode:'A', productName:'A', vietnameseName:'A', aliases:[], active:true } as unknown as Product
    expect(normalizeProduct(legacy)).toMatchObject({ productGroup:'ambient', packaging:{ type:'carton-only', note:'' } })
  })
  it('giữ nguyên quy cách dù không khớp nhóm hàng cũ', () => {
    const product = { id:'b', productCode:'B', productName:'B', vietnameseName:'B', aliases:[], active:true, productGroup:'frozen', packaging:{ type:'box-pack', packsPerBox:12, note:'' } } as Product
    expect(normalizeProduct(product).packaging).toMatchObject({ type:'box-pack', packsPerBox:12 })
  })
  it('hiển thị quy cách nhiều cấp', () => {
    expect(packagingSummary({ packaging:{ type:'carton-bag-pack', bagsPerCarton:10, packsPerBag:5, note:'' } })).toBe('1 thùng = 10 túi · 1 túi = 5 gói')
  })
  it('kiểm tra số nguyên dương theo kiểu quy cách', () => {
    expect(validatePackaging({ type:'carton-pack', packsPerCarton:0, note:'' })).toHaveLength(1)
    expect(validatePackaging({ type:'carton-pack', note:'' })).toEqual([])
    expect(validatePackaging({ type:'basket-bag-pack', note:'' })).toEqual([])
    expect(validatePackaging({ type:'box-pack', note:'' })).toEqual([])
    expect(validatePackaging({ type:'carton-bag-pack', bagsPerCarton:4, packsPerBag:12, note:'' })).toEqual([])
    expect(validatePackaging({ type:'basket-bag-pack', bagsPerBasket:6, packsPerBag:10, note:'' })).toEqual([])
    expect(validatePackaging({ type:'box-bag-pack', bagsPerBox:4, packsPerBag:8, note:'' })).toEqual([])
    expect(validatePackaging({ type:'box-pack', packsPerBox:24, note:'' })).toEqual([])
  })
  it('đọc nhãn tiếng Việt từ file import', () => {
    expect(parseProductGroup('Hàng chill')).toBe('chilled')
    expect(parseProductGroup('Hàng đông lạnh')).toBe('frozen')
    expect(parsePackagingType('Thùng → túi → gói')).toBe('carton-bag-pack')
    expect(parsePackagingType('Rổ / túi')).toBe('basket-bag')
    expect(parsePackagingType('Rổ → túi → gói')).toBe('basket-bag-pack')
    expect(parsePackagingType('Hộp → túi → gói')).toBe('box-bag-pack')
    expect(parsePackagingType('Hộp → gói')).toBe('box-pack')
  })
  it('xác định đơn vị theo quy cách, không phụ thuộc nhóm hàng', () => {
    expect(allowedUnits({ packaging:{ type:'basket-bag-pack', note:'' } })).toEqual(['rổ','túi','gói'])
    expect(allowedUnits({ packaging:{ type:'box-pack', note:'' } })).toEqual(['hộp','gói'])
    expect(allowedUnits({ packaging:{ type:'carton-pack', note:'' } })).toEqual(['thùng','gói'])
    expect(allowedUnits({ packaging:{ type:'basket-bag', note:'' } })).toEqual(['rổ','túi','gói'])
  })
  it('quy đổi đồng thời nhiều đơn vị về gói', () => {
    const product = { packaging:{ type:'basket-bag-pack', bagsPerBasket:4, packsPerBag:6, note:'' } } as Product
    expect(quantityEntryUnits(product).map((unit)=>unit.label)).toEqual(['rổ','túi','gói'])
    expect(quantityBreakdownToPacks({ baskets:2, bags:3, packs:2 },product)).toBe(68)
    expect(lotQuantityInPacks({ lotId:'1', productionDate:'2026-01-01', quantity:2, unit:'rổ', datePercent:50, lotLabel:'' },product)).toBe(48)
  })
})
