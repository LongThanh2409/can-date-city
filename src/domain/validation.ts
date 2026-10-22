import type { Lot } from '../types'

export function validateLots(lots: Lot[], allowedUnits?: string[]): string[] {
  const errors: string[] = []
  if (!lots.length) errors.push('Cần ít nhất một lô.')
  lots.forEach((lot, index) => {
    const prefix = `Lô ${index + 1}`
    if (!lot.productionDate) errors.push(`${prefix}: thiếu ngày sản xuất.`)
    if (!Number.isFinite(lot.quantity) || lot.quantity < 0) errors.push(`${prefix}: số lượng phải từ 0 trở lên.`)
    if (!lot.unit.trim()) errors.push(`${prefix}: đơn vị không được trống.`)
    else if (allowedUnits && !allowedUnits.includes(lot.unit)) errors.push(`${prefix}: đơn vị phải là ${allowedUnits.join(' hoặc ')}.`)
    if (!Number.isFinite(lot.datePercent) || lot.datePercent < 0 || lot.datePercent > 100) errors.push(`${prefix}: % date phải từ 0 đến 100.`)
  })
  const byDate = new Map<string, Lot[]>()
  lots.forEach((lot) => byDate.set(lot.productionDate, [...(byDate.get(lot.productionDate) ?? []), lot]))
  byDate.forEach((sameDate) => {
    if (sameDate.length > 1 && sameDate.some((lot) => !lot.lotLabel.trim())) errors.push(`Các lô cùng ngày ${sameDate[0].productionDate} cần mã lô/ghi chú để phân biệt.`)
    const labels = sameDate.map((lot) => lot.lotLabel.trim().toLowerCase()).filter(Boolean)
    if (new Set(labels).size !== labels.length) errors.push(`Mã lô bị trùng trong ngày ${sameDate[0].productionDate}.`)
  })
  return errors
}
