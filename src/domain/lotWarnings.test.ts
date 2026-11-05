import { describe, expect, it } from 'vitest'
import { estimateDailyDrop, lotWarnings, type LotWarningInput } from './lotWarnings'
import type { DateRecord, Lot } from '../types'

let nextId = 0
const lot = (productionDate: string, datePercent: number, overrides: Partial<Lot> = {}): Lot => ({ lotId: `l${++nextId}`, productionDate, datePercent, quantity: 10, unit: 'gói', lotLabel: '', ...overrides })
const record = (chatDate: string, lots: Lot[], isNewDate = false): DateRecord => ({ id: `${chatDate}_p`, chatDate, productId: 'p', productCode: 'SP', productName: '', vietnameseName: '', isNewDate, lots, createdBy: 'u', updatedBy: 'u' })
const codes = (input: Partial<LotWarningInput> & { lots: Lot[] }) => lotWarnings({ chatDate: '2026-11-06', isNewDate: null, history: [], ...input }).map((warning) => warning.id.split(':')[0])

// This product loses 1 point a day, across four earlier dates.
const steady = [record('2026-11-02', [lot('2026-09-01', 40)]), record('2026-11-03', [lot('2026-09-01', 39)]), record('2026-11-04', [lot('2026-09-01', 38)]), record('2026-11-05', [lot('2026-09-01', 37)])]

describe('estimateDailyDrop', () => {
  it('học tốc độ từ cùng lô qua nhiều ngày', () => {
    expect(estimateDailyDrop(steady)).toBe(1)
  })
  it('học tốc độ từ hai NSX khác nhau trong cùng ngày', () => {
    expect(estimateDailyDrop([record('2026-11-05', [lot('2026-09-01', 40), lot('2026-09-11', 45)])])).toBe(0.5)
  })
  it('không ước tính khi quá ít dữ liệu', () => {
    expect(estimateDailyDrop([record('2026-11-05', [lot('2026-09-01', 40)])])).toBeUndefined()
  })
  it('một số nhập sai không làm lệch trung vị', () => {
    expect(estimateDailyDrop([...steady, record('2026-10-30', [lot('2026-09-20', 90), lot('2026-09-25', 95)]), record('2026-10-31', [lot('2026-08-01', 30), lot('2026-08-11', 40)])])).toBe(1)
  })
})

describe('các lô trong cùng ngày', () => {
  it('cảnh báo NSX cũ hơn nhưng % cao hơn, gắn vào lô cũ', () => {
    const older = lot('2026-09-01', 86), newer = lot('2026-10-01', 70)
    const warnings = lotWarnings({ chatDate: '2026-11-06', lots: [newer, older], isNewDate: null, history: [] })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({ lotId: older.lotId })
    expect(warnings[0].message).toContain('Lô 1')
  })
  it('bỏ qua chênh lệch làm tròn', () => {
    expect(codes({ lots: [lot('2026-10-01', 70), lot('2026-10-02', 69)] })).toEqual([])
  })
  it('cảnh báo NSX tương lai', () => {
    expect(codes({ lots: [lot('2026-11-07', 90)] })).toEqual(['future'])
  })
  it('cảnh báo cùng NSX nhưng % lệch nhiều, cho phép lệch ít', () => {
    expect(codes({ lots: [lot('2026-10-01', 70, { lotLabel: 'A' }), lot('2026-10-01', 80, { lotLabel: 'B' })] })).toEqual(['spread'])
    expect(codes({ lots: [lot('2026-10-01', 70, { lotLabel: 'A' }), lot('2026-10-01', 72, { lotLabel: 'B' })] })).toEqual([])
  })
  it('cảnh báo NSX cách xa mà % gần bằng nhau khi chưa có tốc độ', () => {
    expect(codes({ lots: [lot('2026-09-01', 70), lot('2026-10-15', 70)] })).toEqual(['gap'])
    expect(codes({ lots: [lot('2026-09-01', 70), lot('2026-09-20', 70)] })).toEqual([])
  })
  it('dùng tốc độ của mã để kiểm tra % có tương xứng với khoảng cách NSX', () => {
    const history = steady
    const prior = lot('2026-09-01', 36)
    expect(codes({ history, lots: [prior, lot('2026-10-01', 66)] }).filter((code) => code === 'gap')).toEqual([])
    expect(codes({ history, lots: [prior, lot('2026-10-01', 40)] }).filter((code) => code === 'gap')).toEqual(['gap'])
  })
  it('cảnh báo NSX có thể sai năm', () => {
    expect(codes({ lots: [lot('2026-09-01', 60), lot('2025-09-02', 60)] })).toContain('far')
  })
  it('bỏ qua lô chưa nhập đủ', () => {
    expect(codes({ lots: [lot('', 90), lot('2026-10-01', Number.NaN), lot('2026-10-02', 70)] })).toEqual([])
  })
})

describe('so với ngày trước đó', () => {
  const yesterday = (lots: Lot[], isNewDate = false) => [record('2026-11-05', lots, isNewDate)]

  it('cảnh báo cùng NSX mà % tăng', () => {
    expect(codes({ lots: [lot('2026-09-01', 86)], history: yesterday([lot('2026-09-01', 64)]) })).toEqual(['rise'])
  })
  it('cảnh báo cùng NSX mà % giảm quá nhiều khi chưa có tốc độ', () => {
    expect(codes({ lots: [lot('2026-09-01', 50)], history: yesterday([lot('2026-09-01', 64)]) })).toEqual(['drop'])
    expect(codes({ lots: [lot('2026-09-01', 58)], history: yesterday([lot('2026-09-01', 64)]) })).toEqual([])
  })
  it('nới ngưỡng giảm theo số ngày cách nhau', () => {
    expect(codes({ lots: [lot('2026-09-01', 50)], history: [record('2026-11-03', [lot('2026-09-01', 64)])] })).toEqual([])
  })
  it('dùng tốc độ của mã: hàng giảm chậm bị cảnh báo sớm hơn', () => {
    expect(codes({ lots: [lot('2026-09-01', 36)], history: steady })).toEqual([])
    expect(codes({ lots: [lot('2026-09-01', 30)], history: steady })).toEqual(['drop'])
  })
  it('hàng giảm nhanh không bị báo nhầm', () => {
    const fast = [record('2026-11-02', [lot('2026-10-20', 40)]), record('2026-11-05', [lot('2026-10-20', 10)])]
    expect(codes({ lots: [lot('2026-10-20', 0)], history: fast })).toEqual([])
  })
  it('cảnh báo % đứng yên khi mã này lẽ ra phải giảm', () => {
    expect(codes({ lots: [lot('2026-09-01', 37)], history: steady, chatDate: '2026-11-08' })).toEqual(['stale'])
  })
  it('không báo % đứng yên với mã giảm rất chậm', () => {
    const slow = [record('2026-10-01', [lot('2026-01-01', 70)]), record('2026-11-05', [lot('2026-01-01', 63)])]
    expect(codes({ lots: [lot('2026-01-01', 63)], history: slow })).toEqual([])
  })
  it('cảnh báo % giảm ít nhưng NSX đổi nhiều', () => {
    const warnings = lotWarnings({ chatDate: '2026-11-06', isNewDate: true, history: yesterday([lot('2026-09-01', 64)]), lots: [lot('2026-08-01', 63)] })
    expect(warnings.map((warning) => warning.id.split(':')[0])).toEqual(['changed'])
    expect(warnings[0].message).toContain('31 ngày')
  })
  it('không báo nhầm khi lô cũ hết và lô mới có % đúng theo tốc độ', () => {
    const incoming = lot('2026-10-01', 66)
    expect(codes({ isNewDate: true, history: steady, lots: [incoming] })).toEqual([])
  })
  it('gợi ý NSX bị đảo ngày/tháng', () => {
    const warnings = lotWarnings({ chatDate: '2026-11-06', isNewDate: false, history: yesterday([lot('2026-05-03', 64)]), lots: [lot('2026-03-05', 63)] })
    expect(warnings[0].message).toContain('03/05/2026')
    expect(warnings.map((warning) => warning.id.split(':')[0])).toEqual(['swap'])
  })
  it('cảnh báo lô mới có NSX cũ hơn mọi lô đang có', () => {
    expect(codes({ isNewDate: true, lots: [lot('2026-09-01', 64), lot('2026-08-29', 30)], history: yesterday([lot('2026-09-01', 65)]) })).toContain('older')
  })
  it('cảnh báo số lượng tăng khi chọn Không có mới, và số lượng gấp 10 lần', () => {
    expect(codes({ isNewDate: false, lots: [lot('2026-09-01', 64, { quantity: 15 })], history: yesterday([lot('2026-09-01', 64)]) })).toEqual(['grew'])
    expect(codes({ isNewDate: true, lots: [lot('2026-09-01', 64, { quantity: 100 })], history: yesterday([lot('2026-09-01', 64)]) })).toEqual(['jump'])
  })
  it('trạng thái có mới không tự gây cảnh báo khi có hoặc không có lô mới', () => {
    expect(codes({ isNewDate: true, lots: [lot('2026-09-01', 64)], history: yesterday([lot('2026-09-01', 64)]) })).toEqual([])
    expect(codes({ isNewDate: false, lots: [lot('2026-09-01', 64), lot('2026-10-30', 95)], history: yesterday([lot('2026-09-01', 64)]) })).toEqual([])
  })
  it('vẫn nhận ra cùng lô khi đổi mã lô', () => {
    expect(codes({ lots: [lot('2026-09-01', 86, { lotLabel: 'mới' })], history: yesterday([lot('2026-09-01', 64, { lotLabel: 'cũ' })]) })).toEqual(['rise'])
  })
  it('so với ngày gần nhất có mã này, không dùng dữ liệu sau ngày chát', () => {
    expect(codes({ lots: [lot('2026-09-01', 64)], history: [record('2026-11-07', [lot('2026-09-01', 99)])] })).toEqual([])
  })
  it('dữ liệu hợp lý thì không có cảnh báo', () => {
    expect(codes({ isNewDate: false, lots: [lot('2026-09-01', 36)], history: steady })).toEqual([])
  })
})
