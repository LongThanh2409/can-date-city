import { describe, expect, it } from 'vitest'
import { validateLots } from './validation'
import type { Lot } from '../types'
const lot=(id:string,label=''):Lot=>({lotId:id,productionDate:'2026-10-01',quantity:0,unit:'hộp',datePercent:100,lotLabel:label})
describe('validateLots',()=>{
  it('cho phép số lượng 0 và % date biên',()=>expect(validateLots([lot('1')])).toEqual([]))
  it('bắt buộc nhập % date',()=>expect(validateLots([{...lot('1'),datePercent:Number.NaN}])[0]).toContain('% date là bắt buộc'))
  it('yêu cầu nhãn khi hai lô trùng ngày',()=>expect(validateLots([lot('1'),lot('2')]).some(e=>e.includes('cần mã lô'))).toBe(true))
  it('chặn số âm và phần trăm ngoài khoảng',()=>expect(validateLots([{...lot('1'),quantity:-1,datePercent:101}]).length).toBe(2))
  it('chặn đơn vị không phù hợp nhóm hàng',()=>expect(validateLots([lot('1')],['rổ','túi'])[0]).toContain('đơn vị phải là rổ hoặc túi'))
})
