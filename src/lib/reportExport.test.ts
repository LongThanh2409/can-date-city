import { describe, expect, it } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import { createNearDatePdfBlob, createNearDateWordBlob, prepareNearDateReport } from './reportExport'
import type { NearDateReportProduct } from './reportExport'
import type { ComparedProduct, DateRecord, Product } from '../types'

const product: Product = {
  id: 'sp-1', productCode: 'SP001', productName: 'Product 1', vietnameseName: 'Sản phẩm 1', aliases: [], productGroup: 'ambient', active: true,
  packaging: { type: 'carton-pack', packsPerCarton: 10, note: '' },
}

const current: DateRecord = {
  id: '2026-10-22_sp-1', chatDate: '2026-10-22', productId: 'sp-1', productCode: 'SP001', productName: 'Product 1', vietnameseName: 'Sản phẩm 1',
  isNewDate: true, saleNote: 'Ưu tiên xuất trước', createdBy: 'admin', updatedBy: 'sale',
  lots: [
    { lotId: '1', productionDate: '2026-10-01', quantity: 20, unit: 'gói', quantityBreakdown: { packs: 20 }, datePercent: 40, lotLabel: 'L01' },
    { lotId: '2', productionDate: '2026-10-01', quantity: 1, unit: 'thùng', quantityBreakdown: { cartons: 1 }, datePercent: 40, lotLabel: 'L02' },
    { lotId: '3', productionDate: '2026-10-02', quantity: 5, unit: 'gói', quantityBreakdown: { packs: 5 }, datePercent: 55, lotLabel: 'L03' },
  ],
}

const row: ComparedProduct = {
  key: 'sp-1', productId: 'sp-1', productCode: 'SP001', productName: 'Product 1', vietnameseName: 'Sản phẩm 1', current, lots: [], status: 'current-only',
}

describe('prepareNearDateReport', () => {
  it('giữ % date theo từng NSX và ghi chú Sale theo mã', () => {
    const [result] = prepareNearDateReport([row], [product])
    expect(result.saleNote).toBe('Ưu tiên xuất trước')
    expect(result.lots).toEqual([
      { productionDate: '2026-10-01', quantityPacks: 30, datePercent: 40 },
      { productionDate: '2026-10-02', quantityPacks: 5, datePercent: 55 },
    ])
    expect(JSON.stringify(result)).not.toContain('L01')
  })

  it('không xuất mã chỉ có ở ngày so sánh', () => {
    expect(prepareNearDateReport([{ ...row, current: undefined }], [product])).toEqual([])
  })

  it('tạo được Word và PDF ở cả bố cục, hướng giấy và chế độ màu', async () => {
    const report = prepareNearDateReport([row], [product])
    const [wordLandscape, pdfLandscape, wordPortrait, pdfPortrait, pdfColor, wordDetailed, pdfDetailed] = await Promise.all([
      createNearDateWordBlob(report, '2026-10-22', 'landscape'),
      createNearDatePdfBlob(report, '2026-10-22', 'landscape'),
      createNearDateWordBlob(report, '2026-10-22', 'portrait'),
      createNearDatePdfBlob(report, '2026-10-22', 'portrait'),
      createNearDatePdfBlob(report, '2026-10-22', 'landscape', 'color'),
      createNearDateWordBlob(report, '2026-10-22', 'landscape', 'monochrome', 'detailed'),
      createNearDatePdfBlob(report, '2026-10-22', 'landscape', 'monochrome', 'detailed'),
    ])
    for (const word of [wordLandscape, wordPortrait, wordDetailed]) {
      expect(word.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      expect(word.size).toBeGreaterThan(5_000)
    }
    for (const pdf of [pdfLandscape, pdfPortrait, pdfColor, pdfDetailed]) {
      expect(pdf.type).toBe('application/pdf')
      expect(pdf.size).toBeGreaterThan(5_000)
    }
  }, 20_000)

  it('tạo mẫu nhiều trang để kiểm tra bố cục', async () => {
    const report: NearDateReportProduct[] = Array.from({ length: process.env.REPORT_QA_LARGE ? 40 : 12 }, (_, productIndex) => ({
      productCode: `SP${String(productIndex + 1).padStart(3, '0')}`,
      productName: `Chilled sausage product with a long warehouse name ${productIndex + 1}`,
      vietnameseName: `Xúc xích tiệt trùng vị đặc biệt dành cho hệ thống kho số ${productIndex + 1}`,
      packaging: '1 hộp = 4 túi · 1 túi = 8 gói',
      saleNote: productIndex % 3 === 0 ? 'Ưu tiên xuất trước cho cửa hàng trung tâm. Kiểm tra đủ số lượng theo từng ngày sản xuất và thực hiện đúng hướng dẫn điều chuyển của Sale trong hôm nay.' : '',
      isNewDate: productIndex % 2 === 0,
      lots: Array.from({ length: productIndex % 4 + 2 }, (_, lotIndex) => ({
        productionDate: `2026-10-${String(lotIndex + 1).padStart(2, '0')}`,
        quantityPacks: (productIndex + 1) * (lotIndex + 1) * 8,
        datePercent: 25 + lotIndex * 13,
      })),
    }))
    const [wordLandscape, pdfLandscape, wordPortrait, pdfPortrait] = await Promise.all([
      createNearDateWordBlob(report, '2026-10-22', 'landscape'),
      createNearDatePdfBlob(report, '2026-10-22', 'landscape'),
      createNearDateWordBlob(report, '2026-10-22', 'portrait'),
      createNearDatePdfBlob(report, '2026-10-22', 'portrait'),
    ])
    expect(wordLandscape.size).toBeGreaterThan(10_000)
    expect(pdfLandscape.size).toBeGreaterThan(10_000)
    expect(wordPortrait.size).toBeGreaterThan(10_000)
    expect(pdfPortrait.size).toBeGreaterThan(10_000)
    const output = process.env.REPORT_QA_OUTPUT
    if (output) {
      await mkdir(output, { recursive: true })
      await Promise.all([
        writeFile(`${output}/can-date-kho-gon-ngang.docx`, Buffer.from(await wordLandscape.arrayBuffer())),
        writeFile(`${output}/can-date-kho-gon-ngang.pdf`, Buffer.from(await pdfLandscape.arrayBuffer())),
        writeFile(`${output}/can-date-kho-gon-doc.docx`, Buffer.from(await wordPortrait.arrayBuffer())),
        writeFile(`${output}/can-date-kho-gon-doc.pdf`, Buffer.from(await pdfPortrait.arrayBuffer())),
      ])
    }
  }, 20_000)
})
