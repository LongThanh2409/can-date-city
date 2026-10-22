import { describe, expect, it } from 'vitest'
import { compareLots, compareRecords } from './compare'
import type { DateRecord, Lot } from '../types'

const lot = (overrides: Partial<Lot> = {}): Lot => ({ lotId:'1', productionDate:'2026-10-01', quantity:10, unit:'thùng', datePercent:65, lotLabel:'A', ...overrides })
const record = (date:string,lots:Lot[],overrides:Partial<DateRecord>={}):DateRecord=>({id:`${date}_p1`,chatDate:date,productId:'p1',productCode:'SP01',productName:'Product',vietnameseName:'Sản phẩm',isNewDate:false,lots,createdBy:'u',updatedBy:'u',...overrides})

describe('compareLots',()=>{
  it('tính tăng, giảm số lượng và chênh lệch điểm phần trăm',()=>{
    expect(compareLots([lot({quantity:15,datePercent:68})],[lot()])[0]).toMatchObject({quantityDelta:5,percentDelta:3,status:'increased'})
    expect(compareLots([lot({quantity:5})],[lot()])[0].status).toBe('decreased')
  })
  it('phát hiện lô mới và lô không còn ghi nhận',()=>{
    expect(compareLots([lot({lotLabel:'B'})],[lot()]).map(x=>x.status).sort()).toEqual(['missing-lot','new-lot'])
  })
  it('không tính chênh lệch số lượng khi đổi đơn vị',()=>{
    expect(compareLots([lot({unit:'kg'})],[lot()])[0]).toMatchObject({quantityDelta:null,status:'unit-changed'})
  })
  it('luôn xếp lô từ ngày sản xuất xa đến gần, không phụ thuộc thứ tự nhập',()=>{
    const lots=compareLots([
      lot({lotId:'3',productionDate:'2026-10-20',lotLabel:'C'}),
      lot({lotId:'1',productionDate:'2026-08-01',lotLabel:'A'}),
      lot({lotId:'2',productionDate:'2026-09-15',lotLabel:'B'}),
    ])
    expect(lots.map((item)=>item.current?.productionDate)).toEqual(['2026-08-01','2026-09-15','2026-10-20'])
  })
})
describe('compareRecords',()=>{
  it('không nhầm nhãn MỚI thủ công với lô mới tự phát hiện',()=>{
    const rows=compareRecords([record('2026-10-21',[lot()],{isNewDate:true})],[record('2026-10-20',[lot()])])
    expect(rows[0].current?.isNewDate).toBe(true); expect(rows[0].lots[0].status).toBe('unchanged')
  })
  it('phát hiện mã chỉ có ở ngày trước',()=>expect(compareRecords([], [record('2026-10-20',[lot()])])[0].status).toBe('previous-only'))
})
