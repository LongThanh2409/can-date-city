import { describe, expect, it } from 'vitest'
import { datesToDelete } from './retention'
describe('datesToDelete',()=>{
  it('giữ đúng 5 ngày lịch mới nhất và bỏ trùng',()=>expect(datesToDelete(['2026-10-15','2026-10-21','2026-10-19','2026-10-18','2026-10-17','2026-10-16','2026-10-21'])).toEqual(['2026-10-15']))
  it('không xóa nếu truy vấn trả ít hơn giới hạn',()=>expect(datesToDelete(['2026-10-21'])).toEqual([]))
})
