import { describe, expect, it } from 'vitest'
import { closestPreviousDate } from './date'

describe('closestPreviousDate', () => {
  it('lấy hôm qua khi hôm qua có dữ liệu', () => {
    expect(closestPreviousDate('2026-11-03',['2026-10-31','2026-11-02','2026-11-03'])).toBe('2026-11-02')
  })

  it('bỏ qua Chủ nhật không có dữ liệu và lấy ngày gần nhất', () => {
    expect(closestPreviousDate('2026-11-02',['2026-10-30','2026-10-31','2026-11-02'])).toBe('2026-10-31')
  })

  it('không lấy ngày hiện tại hoặc ngày sau đó', () => {
    expect(closestPreviousDate('2026-11-02',['2026-11-02','2026-11-03'])).toBeUndefined()
  })
})
