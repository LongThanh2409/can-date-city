import { describe, expect, it } from 'vitest'
import { analyzeSaleNote } from './noteEmphasis'

const boldText = (note: string) => analyzeSaleNote(note).runs.filter((run) => run.bold).map((run) => run.text)

describe('analyzeSaleNote', () => {
  it('không tô FIFO thường, kể cả điểm sỉ và ghi chú trống', () => {
    for (const note of ['ĐI FIFO', 'SỸ ĐI FIFO', 'đi fifo', '']) {
      expect(analyzeSaleNote(note)).toMatchObject({ emphasizeName:false, designatedPercents:[] })
      expect(boldText(note)).toEqual([])
    }
  })

  it('không tô mã không đi, kể cả khi câu có số', () => {
    for (const note of ['NAY K ĐI', 'K ĐI', 'nay không đi', 'K ĐI 61', 'NAY K ĐI DATE 70']) {
      expect(analyzeSaleNote(note)).toMatchObject({ emphasizeName:false, designatedPercents:[] })
      expect(boldText(note)).toEqual([])
    }
  })

  it('tô tên và câu đi nốt cận', () => {
    for (const note of ['ĐI NỐT CẬN', 'đi nốt cận', 'ĐỨC THÀNH ĐI NỐT CẬN', 'XUẤT NỐT CẬN', 'Đi nốt']) {
      expect(analyzeSaleNote(note).emphasizeName).toBe(true)
      expect(boldText(note)).toEqual([note])
    }
    expect(boldText('ĐI NỐT CẬN\nCÒN LẠI ĐI FIFO')).toEqual(['ĐI NỐT CẬN'])
  })

  it('chỉ tô phần số lượng của FIFO giới hạn', () => {
    for (const [note, quantity] of [['ĐI FIFO 5G','5G'],['ĐI FIFO 150G','150G'],['ĐI FIFO 30 gói','30 gói']]) {
      expect(analyzeSaleNote(note)).toMatchObject({ emphasizeName:false, designatedPercents:[] })
      expect(boldText(note)).toEqual([quantity])
    }
  })

  it('tô mệnh đề khách chỉ định date, giữ thường phần còn lại đi FIFO', () => {
    const note = 'AEON ĐI DATE 70%\nCÒN LẠI ĐI FIFO'
    expect(analyzeSaleNote(note)).toMatchObject({ emphasizeName:true, designatedPercents:[70] })
    expect(boldText(note)).toEqual(['AEON ĐI DATE 70%'])
    expect(analyzeSaleNote(note).runs.map((run) => run.text).join('')).toBe(note)
  })

  it('đọc đúng ghi chú nhiều nhóm khách của nem', () => {
    const note = 'AEON TO VÀ BHX ĐỒNG VĂN + QUẢNG NINH (6150G10797+6150G10800) ĐI DATE TRÊN 70\nCÁC AEON NHỎ CÒN LẠI, THÁI HƯNG ĐI DATE 65\nCÁC BHX CÒN LẠI ĐI DATE 67\nCÒN LẠI ĐI FIFO DATE 63'
    expect(analyzeSaleNote(note).designatedPercents.sort()).toEqual([63,65,67])
    expect(boldText(note)).toEqual(note.split('\n'))
  })

  it('tách mệnh đề còn lại sau dấu phẩy và đọc date đi trộn', () => {
    const note = 'AEON + 6150G11529 ĐI DATE 67, CÒN LẠI ĐI TRỘN DATE 54 VÀ 67 TẤT CẢ CÁC SO TỈ LỆ 50 - 50 (ĐI ĐƯỢC 105G DATE 54)'
    expect(analyzeSaleNote(note).designatedPercents.sort()).toEqual([54,67])
    expect(boldText(note).join('')).toBe(note.replace(', ',''))
  })

  it('giữ dấu phẩy giữa các khách trong cùng mệnh đề và tô số lượng còn lại', () => {
    const note = 'AEON , BIGC ĐI DATE 66%\nCÒN LẠI ĐI FIFO 1.879'
    expect(analyzeSaleNote(note).designatedPercents).toEqual([66])
    expect(boldText(note)).toEqual(['AEON , BIGC ĐI DATE 66%','1.879'])
  })

  it('hiểu % không có chữ DATE của nhóm còn lại', () => {
    const note = 'BIGC SO 6150G11093 + MEGA ĐI DATE 52%\nCÒN LẠI ĐI 61'
    expect(analyzeSaleNote(note).designatedPercents.sort()).toEqual([52,61])
    expect(boldText(note)).toEqual(note.split('\n'))
  })

  it('date dạng trên/từ là khoảng nên không chỉ định lô', () => {
    const note = 'THÁI HƯNG ĐI DATE TRÊN 70\nVIN + ĐỨC THÀNH ĐI DATE TRÊN 65%\nCÒN LẠI ĐI TỪ DATE 67'
    expect(analyzeSaleNote(note)).toMatchObject({ emphasizeName:true, designatedPercents:[] })
  })

  it('không đọc ngày, số gói hay mã SO thành %', () => {
    const note = 'Sót date 9/10 và 12/10 3goi ạ: ĐỨC THÀNH ĐI NỐT\nCÒN LẠI ĐI FIFO'
    expect(analyzeSaleNote(note)).toMatchObject({ emphasizeName:true, designatedPercents:[] })
    expect(boldText(note)).toEqual(['Sót date 9/10 và 12/10 3goi ạ: ĐỨC THÀNH ĐI NỐT'])
    expect(analyzeSaleNote('ĐI 105G').designatedPercents).toEqual([])
    expect(analyzeSaleNote('ĐI 1.310').designatedPercents).toEqual([])
    expect(analyzeSaleNote('SO 6150G11093').designatedPercents).toEqual([])
  })

  it('giữ nguyên toàn bộ nội dung ghi chú', () => {
    const note = 'ĐỨC THÀNH, FM ĐI DATE 40%\nCÒN LẠI ĐI 73'
    expect(analyzeSaleNote(note).runs.map((run) => run.text).join('')).toBe(note)
  })
})
