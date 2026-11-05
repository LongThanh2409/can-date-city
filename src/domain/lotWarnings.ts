import { daysBetween, formatDate } from '../lib/date'
import { lotIdentity } from './compare'
import { lotQuantityInPacks } from './product'
import type { DateRecord, Lot, Product } from '../types'

export interface LotWarning {
  id: string
  /** Absent when the warning is about the whole record rather than one lot. */
  lotId?: string
  message: string
}

export interface LotWarningInput {
  chatDate: string
  lots: Lot[]
  isNewDate: boolean | null
  /** Records of the same product on any date; records on chatDate are ignored. */
  history: DateRecord[]
  product?: Pick<Product, 'packaging'>
}

// Starting values, meant to be tuned once real false alarms are known.
const PERCENT_ROUNDING = 1
const SAME_DATE_MAX_SPREAD = 3
const FAR_DATE_DAYS = 300
const MAX_DROP_PER_DAY_WITHOUT_RATE = 10
const MIN_EXTRA_DROP = 3
const STALE_MIN_EXPECTED_DROP = 2
const CHANGED_DATE_MIN_DAYS = 4
const CHANGED_DATE_MAX_PERCENT_GAP = 5
const FLAT_PERCENT_MIN_GAP_DAYS = 30
const SPREAD_MIN_TOLERANCE = 5
const QUANTITY_JUMP_RATIO = 10
const RATE_MIN_SPAN_SAME_LOT = 3
const RATE_MIN_SPAN_SAME_DAY = 5

const points = (value: number) => String(Math.round(Math.abs(value) * 10) / 10).replace('.', ',')
const isComplete = (lot: Lot) => Number.isFinite(lot.datePercent) && Number.isFinite(daysBetween(lot.productionDate, lot.productionDate))

function quantityOf(lot: Lot, product?: Pick<Product, 'packaging'>): number | null {
  const quantity = product ? lotQuantityInPacks(lot, product) : lot.unit === 'gói' ? lot.quantity : null
  return quantity !== null && Number.isFinite(quantity) ? quantity : null
}

/** Points of % date lost per day, learned only from this product's own saved lots. Undefined when there is too little data. */
export function estimateDailyDrop(history: DateRecord[]): number | undefined {
  const samples: number[] = []
  const observations = new Map<string, { date: string; percent: number }[]>()
  history.forEach((record) => {
    const lots = record.lots.filter(isComplete)
    lots.forEach((older) => {
      const key = lotIdentity(older)
      observations.set(key, [...(observations.get(key) ?? []), { date: record.chatDate, percent: older.datePercent }])
      lots.forEach((newer) => {
        const span = daysBetween(older.productionDate, newer.productionDate)
        if (span >= RATE_MIN_SPAN_SAME_DAY) samples.push((newer.datePercent - older.datePercent) / span)
      })
    })
  })
  observations.forEach((items) => {
    const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date))
    const span = daysBetween(sorted[0].date, sorted[sorted.length - 1].date)
    if (span >= RATE_MIN_SPAN_SAME_LOT) samples.push((sorted[0].percent - sorted[sorted.length - 1].percent) / span)
  })
  const usable = samples.filter((sample) => sample >= 0).sort((a, b) => a - b)
  if (!usable.length) return undefined
  const middle = usable.length >> 1
  const median = usable.length % 2 ? usable[middle] : (usable[middle - 1] + usable[middle]) / 2
  return median > 0 ? median : undefined
}

/** Pairs lots by date and label, then by date alone when that date has a single lot on both days, so a renamed label still counts as the same lot. */
function matchLots(current: Lot[], previous: Lot[]) {
  const matches = new Map<Lot, Lot>()
  const free = new Set(previous)
  current.forEach((lot) => {
    const exact = [...free].find((candidate) => lotIdentity(candidate) === lotIdentity(lot))
    if (exact) { matches.set(lot, exact); free.delete(exact) }
  })
  current.filter((lot) => !matches.has(lot)).forEach((lot) => {
    const candidates = [...free].filter((candidate) => candidate.productionDate === lot.productionDate)
    const rivals = current.filter((other) => !matches.has(other) && other.productionDate === lot.productionDate)
    if (candidates.length === 1 && rivals.length === 1) { matches.set(lot, candidates[0]); free.delete(candidates[0]) }
  })
  return { matches, unmatchedPrevious: [...free] }
}

function swapDayMonth(date: string): string | undefined {
  const [year, month, day] = date.split('-')
  return Number(day) <= 12 && month !== day ? `${year}-${day}-${month}` : undefined
}

export function lotWarnings({ chatDate, lots, isNewDate, history, product }: LotWarningInput): LotWarning[] {
  const warnings: LotWarning[] = []
  const add = (id: string, message: string, lotId?: string) => warnings.push({ id, lotId, message })
  const others = history.filter((record) => record.chatDate !== chatDate)
  const rate = estimateDailyDrop(others)
  const earlier = others.filter((record) => record.chatDate < chatDate).sort((a, b) => b.chatDate.localeCompare(a.chatDate))
  const previous = earlier[0]
  const complete = lots.filter(isComplete)
  const label = (lot: Lot) => `Lô ${lots.indexOf(lot) + 1}`

  complete.forEach((lot) => {
    if (lot.productionDate > chatDate) add(`future:${lot.lotId}`, `NSX ${formatDate(lot.productionDate)} nằm sau ngày chát ${formatDate(chatDate)}.`, lot.lotId)
  })

  complete.forEach((first, index) => {
    complete.slice(index + 1).forEach((second) => {
      const [older, newer] = first.productionDate <= second.productionDate ? [first, second] : [second, first]
      const gap = daysBetween(older.productionDate, newer.productionDate)
      const difference = newer.datePercent - older.datePercent
      const pair = `${older.lotId}:${newer.lotId}`
      if (gap === 0) {
        if (Math.abs(difference) > SAME_DATE_MAX_SPREAD) add(`spread:${pair}`, `Cùng NSX với ${label(older)} nhưng % lệch ${points(difference)} điểm (${newer.datePercent}% và ${older.datePercent}%).`, newer.lotId)
        return
      }
      if (difference < -PERCENT_ROUNDING) {
        add(`order:${pair}`, `NSX cũ hơn ${label(newer)} nhưng % lại cao hơn (${older.datePercent}% so với ${newer.datePercent}%).`, older.lotId)
        return
      }
      const expected = rate === undefined ? undefined : rate * gap
      if (expected !== undefined && Math.abs(difference - expected) > Math.max(SPREAD_MIN_TOLERANCE, expected / 2)) {
        add(`gap:${pair}`, `NSX cách ${label(older)} ${gap} ngày nhưng % chênh ${points(difference)} điểm, dự kiến khoảng ${points(expected)} điểm.`, newer.lotId)
      } else if (expected === undefined && gap >= FLAT_PERCENT_MIN_GAP_DAYS && difference <= PERCENT_ROUNDING) {
        add(`gap:${pair}`, `NSX cách ${label(older)} ${gap} ngày nhưng % gần như bằng nhau (${older.datePercent}% và ${newer.datePercent}%).`, newer.lotId)
      }
    })
  })

  const previousLots = previous?.lots.filter(isComplete) ?? []
  const { matches, unmatchedPrevious } = matchLots(complete, previousLots)
  const unmatched = complete.filter((lot) => !matches.has(lot))
  const isFarDate = (lot: Lot) => {
    const references = [...complete.filter((other) => other !== lot), ...previousLots].map((other) => other.productionDate)
    return references.length > 0 && references.every((date) => Math.abs(daysBetween(lot.productionDate, date)) >= FAR_DATE_DAYS)
  }

  complete.forEach((lot) => {
    const before = matches.get(lot)
    if (!before || !previous) return
    const gap = daysBetween(previous.chatDate, chatDate)
    const on = formatDate(previous.chatDate)
    const drop = before.datePercent - lot.datePercent
    if (drop < -PERCENT_ROUNDING) {
      add(`rise:${lot.lotId}`, `Ngày ${on} lô này là ${before.datePercent}%, nay tăng ${points(drop)} điểm.`, lot.lotId)
    } else {
      const expected = rate === undefined ? undefined : rate * gap
      const allowed = expected === undefined ? MAX_DROP_PER_DAY_WITHOUT_RATE * gap : expected + Math.max(MIN_EXTRA_DROP, expected)
      if (drop > allowed) add(`drop:${lot.lotId}`, `Ngày ${on} lô này là ${before.datePercent}%, nay giảm ${points(drop)} điểm sau ${gap} ngày${expected === undefined ? '' : `, dự kiến khoảng ${points(expected)} điểm`}.`, lot.lotId)
    }
    if (rate !== undefined && lot.datePercent === before.datePercent) {
      let since = previous.chatDate
      for (const record of earlier.slice(1)) {
        if (!record.lots.some((item) => lotIdentity(item) === lotIdentity(before) && item.datePercent === lot.datePercent)) break
        since = record.chatDate
      }
      const staleDays = daysBetween(since, chatDate)
      if (rate * staleDays >= STALE_MIN_EXPECTED_DROP) add(`stale:${lot.lotId}`, `% giữ nguyên ${lot.datePercent}% suốt ${staleDays} ngày, trong khi mã này thường giảm khoảng ${points(rate * staleDays)} điểm. Có thể quên sửa sau khi sao chép.`, lot.lotId)
    }
    const quantity = quantityOf(lot, product), beforeQuantity = quantityOf(before, product)
    if (quantity === null || beforeQuantity === null) return
    if (isNewDate === false && quantity > beforeQuantity) add(`grew:${lot.lotId}`, `Đã chọn "Không có mới" nhưng số lượng tăng từ ${beforeQuantity} lên ${quantity} gói.`, lot.lotId)
    if (quantity > 0 && beforeQuantity > 0 && Math.max(quantity, beforeQuantity) / Math.min(quantity, beforeQuantity) >= QUANTITY_JUMP_RATIO) add(`jump:${lot.lotId}`, `Số lượng đổi từ ${beforeQuantity} thành ${quantity} gói, gấp từ ${QUANTITY_JUMP_RATIO} lần. Kiểm tra lại số chữ số.`, lot.lotId)
  })

  // At most one per lot, from most to least specific, so a single typo does not raise a stack of warnings.
  complete.forEach((lot) => {
    const swapped = matches.has(lot) ? undefined : swapDayMonth(lot.productionDate)
    if (swapped && unmatchedPrevious.some((before) => before.productionDate === swapped)) {
      add(`swap:${lot.lotId}`, `NSX ${formatDate(lot.productionDate)} có thể bị đảo ngày/tháng. Có phải ${formatDate(swapped)}?`, lot.lotId)
    } else if (isFarDate(lot)) {
      add(`far:${lot.lotId}`, `NSX ${formatDate(lot.productionDate)} lệch từ ${FAR_DATE_DAYS} ngày so với các lô khác. Có thể sai năm.`, lot.lotId)
    } else if (!matches.has(lot)) {
      const replaced = unmatchedPrevious.find((before) => {
        const days = Math.abs(daysBetween(before.productionDate, lot.productionDate))
        const difference = Math.abs(before.datePercent - lot.datePercent)
        return days >= CHANGED_DATE_MIN_DAYS && difference <= (rate === undefined ? CHANGED_DATE_MAX_PERCENT_GAP : rate * days / 2)
      })
      if (replaced) add(`changed:${lot.lotId}`, `Lô NSX ${formatDate(replaced.productionDate)} (${replaced.datePercent}%) không còn, lô này ${lot.datePercent}% gần bằng nhưng NSX lệch ${Math.abs(daysBetween(replaced.productionDate, lot.productionDate))} ngày. Có thể nhập nhầm NSX.`, lot.lotId)
      else if (previousLots.length && previousLots.every((before) => lot.productionDate < before.productionDate)) add(`older:${lot.lotId}`, `Lô mới nhưng NSX cũ hơn mọi lô của ngày ${formatDate(previous!.chatDate)}.`, lot.lotId)
    }
  })

  if (previous && complete.length) {
    const grew = complete.some((lot) => {
      const before = matches.get(lot)
      const quantity = quantityOf(lot, product), beforeQuantity = before ? quantityOf(before, product) : null
      return quantity !== null && beforeQuantity !== null && quantity > beforeQuantity
    })
    if (isNewDate === false && unmatched.length) add('status:no-new', `Đã chọn "Không có mới" nhưng có ${unmatched.length} lô chưa có ở ngày ${formatDate(previous.chatDate)}.`)
    if (isNewDate === true && !unmatched.length && !grew) add('status:new', `Đã chọn "Có mới" nhưng không có lô mới và số lượng không tăng so với ngày ${formatDate(previous.chatDate)}.`)
  }
  return warnings
}
