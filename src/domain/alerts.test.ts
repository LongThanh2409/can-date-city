import { describe, expect, it } from 'vitest'
import { recordNeedsAttention } from './alerts'
import type { DateRecord } from '../types'

const record = (overrides: Partial<DateRecord> = {}): DateRecord => ({
  id:'2026-10-23_sp1',chatDate:'2026-10-23',productId:'sp1',productCode:'SP1',productName:'',vietnameseName:'',isNewDate:false,saleNote:'',lots:[{lotId:'1',productionDate:'2026-10-01',quantity:10,unit:'gói',datePercent:60,lotLabel:''}],createdBy:'admin',updatedBy:'admin',...overrides,
})

describe('recordNeedsAttention',()=>{
  it('cảnh báo khi % date chạm ngưỡng',()=>expect(recordNeedsAttention(record({lots:[{...record().lots[0],datePercent:30}]}),'2026-10-23')).toBe(true))
  it('cảnh báo ưu tiên khẩn chưa hoàn tất',()=>expect(recordNeedsAttention(record({saleWorkflow:{status:'in_progress',priority:'urgent'}}),'2026-10-23')).toBe(true))
  it('không cảnh báo công việc khẩn đã hoàn tất nếu % date an toàn',()=>expect(recordNeedsAttention(record({saleWorkflow:{status:'done',priority:'urgent'}}),'2026-10-23')).toBe(false))
  it('cảnh báo công việc quá hạn',()=>expect(recordNeedsAttention(record({saleWorkflow:{status:'pending',priority:'normal',dueDate:'2026-10-22'}}),'2026-10-23')).toBe(true))
})
