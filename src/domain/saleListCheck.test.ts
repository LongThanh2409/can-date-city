import { describe, expect, it } from 'vitest'
import { checkSaleList, parseSaleCodes, saleListMessage } from './saleListCheck'
import type { DateRecord, Product } from '../types'

const product = (overrides: Partial<Product> = {}): Product => ({
  id:'sp1',productCode:'SP1',productName:'Yogurt',vietnameseName:'Sữa chua dâu',aliases:[],productGroup:'chilled',packaging:{type:'carton-pack',packsPerCarton:24,note:''},active:true,...overrides,
})

const record = (overrides: Partial<DateRecord> = {}): DateRecord => ({
  id:'2026-11-10_sp1',chatDate:'2026-11-10',productId:'sp1',productCode:'SP1',productName:'Yogurt',vietnameseName:'Sữa chua dâu',isNewDate:false,saleNote:'',
  lots:[{lotId:'1',productionDate:'2026-09-01',quantity:2,unit:'thùng',datePercent:35,lotLabel:''}],createdBy:'admin',updatedBy:'admin',...overrides,
})

describe('parseSaleCodes',()=>{
  it('tách cột dán từ Excel, bỏ dòng trống và mã trùng',()=>expect(parseSaleCodes('SP1\r\n\r\n sp2 \nSP1\n')).toEqual(['SP1','sp2']))
  it('chỉ lấy ô đầu khi dán cả hàng',()=>expect(parseSaleCodes('SP1\tSữa chua\t10\nSP2\tXúc xích')).toEqual(['SP1','SP2']))
})

describe('checkSaleList',()=>{
  const products=[product(),product({id:'sp2',productCode:'SP2',productName:'Sausage',vietnameseName:'Xúc xích',aliases:['XX-01']})]

  it('chia mã có cận date và không có cận date theo thứ tự Sale gửi',()=>{
    const result=checkSaleList('SP2\nsp 1\nKHONGCO',[record()],products)
    expect(result.pastedCount).toBe(3)
    expect(result.nearDate.map((item)=>item.code)).toEqual(['SP1'])
    expect(result.nearDate[0].lots[0].packs).toBe(48)
    expect(result.notNearDate).toEqual([
      {code:'SP2',productName:'Sausage',vietnameseName:'Xúc xích',inCatalog:true},
      {code:'KHONGCO',productName:'',vietnameseName:'',inCatalog:false},
    ])
  })

  it('nhận mã theo tên gọi khác và không lặp mã',()=>{
    const result=checkSaleList('XX-01\nSP2',[record({id:'r2',productId:'sp2',productCode:'SP2',isNewDate:true})],products)
    expect(result.nearDate).toHaveLength(1)
    expect(result.nearDate[0]).toMatchObject({code:'SP2',isNewDate:true})
  })

  it('không coi mã đã hết lô là cận date',()=>{
    const result=checkSaleList('SP1',[record({lots:[]})],products)
    expect(result.nearDate).toEqual([])
    expect(result.notNearDate.map((item)=>item.code)).toEqual(['SP1'])
  })

  it('soạn tin nhắn gửi Sale',()=>{
    const result=checkSaleList('SP1\nSP2',[record()],products)
    expect(saleListMessage(result,'2026-11-10')).toBe([
      'Các mã đang cận date (10/11/2026):',
      '- SP1 Sữa chua dâu · Không có mới',
      '   + 48 gói (NSX 01/09/2026 – 35%)',
      '',
      'Các mã không có cận date:',
      '- SP2 Xúc xích',
    ].join('\n'))
  })
})
