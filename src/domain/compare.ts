import type { ComparedLot, ComparedProduct, DateRecord, Lot } from '../types'

export function lotIdentity(lot: Lot): string {
  return `${lot.productionDate}::${lot.lotLabel.trim().toLocaleLowerCase('vi')}`
}

export function compareLots(current: Lot[] = [], previous: Lot[] = []): ComparedLot[] {
  const currentMap = new Map(current.map((lot) => [lotIdentity(lot), lot]))
  const previousMap = new Map(previous.map((lot) => [lotIdentity(lot), lot]))
  const keys = [...new Set([...currentMap.keys(), ...previousMap.keys()])].sort()
  return keys.map((key) => {
    const now = currentMap.get(key)
    const before = previousMap.get(key)
    if (!before) return { key, current: now, quantityDelta: null, percentDelta: null, status: 'new-lot' }
    if (!now) return { key, previous: before, quantityDelta: null, percentDelta: null, status: 'missing-lot' }
    const percentDelta = now.datePercent - before.datePercent
    if (now.unit.trim().toLowerCase() !== before.unit.trim().toLowerCase()) {
      return { key, current: now, previous: before, quantityDelta: null, percentDelta, status: 'unit-changed' }
    }
    const quantityDelta = now.quantity - before.quantity
    const status = quantityDelta > 0 ? 'increased' : quantityDelta < 0 ? 'decreased' : percentDelta !== 0 ? 'changed' : 'unchanged'
    return { key, current: now, previous: before, quantityDelta, percentDelta, status }
  })
}

export function compareRecords(current: DateRecord[], previous: DateRecord[]): ComparedProduct[] {
  const currentMap = new Map(current.map((record) => [record.productId, record]))
  const previousMap = new Map(previous.map((record) => [record.productId, record]))
  return [...new Set([...currentMap.keys(), ...previousMap.keys()])].map((key) => {
    const now = currentMap.get(key)
    const before = previousMap.get(key)
    const lots = compareLots(now?.lots, before?.lots)
    const fallback = now ?? before!
    const status = !before ? 'current-only' : !now ? 'previous-only' : lots.some((lot) => lot.status !== 'unchanged') || now.isNewDate !== before.isNewDate ? 'changed' : 'unchanged'
    return { key, productId: fallback.productId, productCode: fallback.productCode, productName: fallback.productName, vietnameseName: fallback.vietnameseName, current: now, previous: before, lots, status }
  })
}

export function comparisonStats(rows: ComparedProduct[]) {
  return {
    currentProducts: rows.filter((row) => row.current).length,
    changedProducts: rows.filter((row) => row.status === 'changed' || row.status === 'current-only').length,
    newLots: rows.flatMap((row) => row.lots).filter((lot) => lot.status === 'new-lot').length,
    markedNew: rows.filter((row) => row.current?.isNewDate).length,
    missing: rows.filter((row) => row.status === 'previous-only').length + rows.flatMap((row) => row.lots).filter((lot) => lot.status === 'missing-lot').length,
  }
}
