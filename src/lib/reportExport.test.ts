import { describe, expect, it } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import { createNearDatePdfBlob, createNearDateWordBlob, estimateOptimizedPageCount, prepareNearDateReport, reportEmphasisKey, resolveReportOrientation } from './reportExport'
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

function pdfPageCount(pdf: Buffer) {
  return pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)?.length ?? 0
}

describe('prepareNearDateReport', () => {
  it('tạo khóa tô đậm riêng cho từng trường và từng lô', () => {
    expect(reportEmphasisKey('SP001','saleNote')).toBe('SP001|saleNote||')
    expect(reportEmphasisKey('SP001','productionDate','2026-10-01',40)).toBe('SP001|productionDate|2026-10-01|40')
    expect(reportEmphasisKey('SP001','datePercent','2026-10-01',40)).not.toBe(reportEmphasisKey('SP001','productionDate','2026-10-01',40))
  })

  it('giữ % date theo từng NSX và ghi chú Sale theo mã', () => {
    const [result] = prepareNearDateReport([row], [product])
    expect(result.saleNote).toBe('Ưu tiên xuất trước')
    expect(result.productGroup).toBe('Hàng thường')
    expect(result.lots).toEqual([
      { productionDate: '2026-10-01', quantityPacks: 30, datePercent: 40 },
      { productionDate: '2026-10-02', quantityPacks: 5, datePercent: 55 },
    ])
    expect(JSON.stringify(result)).not.toContain('L01')
  })

  it('không xuất mã chỉ có ở ngày so sánh', () => {
    expect(prepareNearDateReport([{ ...row, current: undefined }], [product])).toEqual([])
  })

  it('tự gom sản phẩm theo nhóm và giữ thứ tự bên trong từng nhóm', () => {
    const groups = [
      { id:'ambient', productGroup:'ambient', productCode:'A01' },
      { id:'chilled-1', productGroup:'chilled', productCode:'C01' },
      { id:'frozen', productGroup:'frozen', productCode:'F01' },
      { id:'chilled-2', productGroup:'chilled', productCode:'C02' },
    ] as const
    const products = groups.map((item)=>({ ...product, ...item })) as Product[]
    const rows = groups.map((item,index)=>({
      ...row,
      key:item.id,
      productId:item.id,
      productCode:item.productCode,
      current:{...current,id:`record-${index}`,productId:item.id,productCode:item.productCode},
    }))
    const grouped = prepareNearDateReport(rows,products)
    expect(grouped.map((item)=>item.productCode)).toEqual(['F01','C01','C02','A01'])
  })

  it('tạo được Word và PDF ở cả bố cục, hướng giấy và chế độ màu', async () => {
    const report = prepareNearDateReport([row], [product])
    const [wordAuto, pdfAuto, wordLandscape, pdfLandscape, wordCompact, pdfCompact, pdfColor, wordDetailed, pdfDetailed] = await Promise.all([
      createNearDateWordBlob(report, '2026-10-22'),
      createNearDatePdfBlob(report, '2026-10-22'),
      createNearDateWordBlob(report, '2026-10-22', 'landscape'),
      createNearDatePdfBlob(report, '2026-10-22', 'landscape'),
      createNearDateWordBlob(report, '2026-10-22', 'portrait', 'monochrome', 'compact'),
      createNearDatePdfBlob(report, '2026-10-22', 'portrait', 'monochrome', 'compact'),
      createNearDatePdfBlob(report, '2026-10-22', 'landscape', 'color'),
      createNearDateWordBlob(report, '2026-10-22', 'landscape', 'monochrome', 'detailed'),
      createNearDatePdfBlob(report, '2026-10-22', 'landscape', 'monochrome', 'detailed'),
    ])
    for (const word of [wordAuto, wordLandscape, wordCompact, wordDetailed]) {
      expect(word.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      expect(word.size).toBeGreaterThan(5_000)
    }
    for (const pdf of [pdfAuto, pdfLandscape, pdfCompact, pdfColor, pdfDetailed]) {
      expect(pdf.type).toBe('application/pdf')
      expect(pdf.size).toBeGreaterThan(5_000)
    }
  }, 20_000)

  it('tạo mẫu nhiều trang để kiểm tra bố cục', async () => {
    const fixtureCount = Number(process.env.REPORT_QA_COUNT ?? (process.env.REPORT_QA_LARGE ? 40 : 12))
    const report: NearDateReportProduct[] = Array.from({ length: fixtureCount }, (_, productIndex) => ({
      productCode: `SP${String(productIndex + 1).padStart(3, '0')}`,
      productName: `Chilled sausage product with a long warehouse name ${productIndex + 1}`,
      vietnameseName: `Xúc xích tiệt trùng vị đặc biệt dành cho hệ thống kho số ${productIndex + 1}`,
      packaging: '1 hộp = 4 túi · 1 túi = 8 gói',
      productGroup: productIndex % 2 === 0 ? 'Hàng chill' : 'Hàng đông lạnh',
      saleNote: productIndex % 3 === 0 ? 'Ưu tiên xuất trước cho cửa hàng trung tâm. Kiểm tra đủ số lượng theo từng ngày sản xuất và thực hiện đúng hướng dẫn điều chuyển của Sale trong hôm nay.' : '',
      isNewDate: productIndex % 2 === 0,
      lots: Array.from({ length: productIndex % 3 === 0 ? 1 : 2 }, (_, lotIndex) => ({
        productionDate: `2026-10-${String(lotIndex + 1).padStart(2, '0')}`,
        quantityPacks: (productIndex + 1) * (lotIndex + 1) * 8,
        datePercent: 25 + lotIndex * 13,
      })),
    }))
    const sampleEmphasis = [
      reportEmphasisKey('SP001','productName'),
      reportEmphasisKey('SP001','saleNote'),
      reportEmphasisKey('SP001','datePercent','2026-10-01',25),
    ]
    const [wordAuto, pdfAuto, wordLandscape, pdfLandscape, wordPortrait, pdfPortrait, pdfAiEmphasis, pdfThreePageTarget] = await Promise.all([
      createNearDateWordBlob(report, '2026-10-22'),
      createNearDatePdfBlob(report, '2026-10-22'),
      createNearDateWordBlob(report, '2026-10-22', 'landscape'),
      createNearDatePdfBlob(report, '2026-10-22', 'landscape'),
      createNearDateWordBlob(report, '2026-10-22', 'portrait'),
      createNearDatePdfBlob(report, '2026-10-22', 'portrait'),
      createNearDatePdfBlob(report, '2026-10-22', 'portrait', 'monochrome', 'optimized', undefined, sampleEmphasis),
      createNearDatePdfBlob(report, '2026-10-22', 'portrait', 'monochrome', 'optimized', undefined, [], 3),
    ])
    expect(resolveReportOrientation(report, 'auto', 'optimized')).toBe('portrait')
    expect(resolveReportOrientation(report, 'landscape', 'optimized')).toBe('portrait')
    const defaultPageCount = await estimateOptimizedPageCount(report, '2026-10-22')
    if (fixtureCount <= 40) expect(defaultPageCount).toBeLessThanOrEqual(2)
    expect(pdfPageCount(Buffer.from(await pdfAuto.arrayBuffer()))).toBe(defaultPageCount)
    expect(pdfPageCount(Buffer.from(await pdfThreePageTarget.arrayBuffer()))).toBe(await estimateOptimizedPageCount(report,'2026-10-22','monochrome',undefined,[],3))
    expect(await estimateOptimizedPageCount(report.slice(0,1),'2026-10-22')).toBe(1)
    if (fixtureCount <= 40) expect(await estimateOptimizedPageCount(report,'2026-10-22','monochrome',undefined,[],3)).toBeLessThanOrEqual(3)
    expect(await estimateOptimizedPageCount(report,'2026-10-22','monochrome',{densityLevel:-2,fontLevel:-1})).toBeLessThanOrEqual(await estimateOptimizedPageCount(report,'2026-10-22','monochrome',{densityLevel:2,fontLevel:2}))
    if (fixtureCount >= 40) {
      const oversizedReport = [...report, ...report.map((item) => ({ ...item, productCode: `${item.productCode}-B` }))]
      expect(await estimateOptimizedPageCount(oversizedReport, '2026-10-22')).toBeGreaterThan(defaultPageCount)
    }
    expect(wordAuto.size).toBeGreaterThan(10_000)
    expect(pdfAuto.size).toBeGreaterThan(10_000)
    expect(wordLandscape.size).toBeGreaterThan(10_000)
    expect(pdfLandscape.size).toBeGreaterThan(10_000)
    expect(wordPortrait.size).toBeGreaterThan(10_000)
    expect(pdfPortrait.size).toBeGreaterThan(10_000)
    expect(pdfAiEmphasis.size).toBeGreaterThan(10_000)
    expect(pdfThreePageTarget.size).toBeGreaterThan(10_000)
    const output = process.env.REPORT_QA_OUTPUT
    if (output) {
      await mkdir(output, { recursive: true })
      await Promise.all([
        writeFile(`${output}/can-date-toi-uu-tu-dong.docx`, Buffer.from(await wordAuto.arrayBuffer())),
        writeFile(`${output}/can-date-toi-uu-tu-dong.pdf`, Buffer.from(await pdfAuto.arrayBuffer())),
        writeFile(`${output}/can-date-kho-gon-ngang.docx`, Buffer.from(await wordLandscape.arrayBuffer())),
        writeFile(`${output}/can-date-kho-gon-ngang.pdf`, Buffer.from(await pdfLandscape.arrayBuffer())),
        writeFile(`${output}/can-date-kho-gon-doc.docx`, Buffer.from(await wordPortrait.arrayBuffer())),
        writeFile(`${output}/can-date-kho-gon-doc.pdf`, Buffer.from(await pdfPortrait.arrayBuffer())),
        writeFile(`${output}/can-date-ai-to-dam.pdf`, Buffer.from(await pdfAiEmphasis.arrayBuffer())),
        writeFile(`${output}/can-date-muc-tieu-3-trang.pdf`, Buffer.from(await pdfThreePageTarget.arrayBuffer())),
      ])
    }
  }, 20_000)
})

describe('chia trang bố cục tối ưu', () => {
  // Generates mixed data: long unbreakable links, multi-line notes, bold notes, 8+ lots.
  function randomReport(seed: number) {
    const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
    const notes = ['OK', 'Ưu tiên\n\nxuất trước\n', 'Xuất CH A 5g\nXuất CH B 7g\nXuất CH C 9g\nGiữ lại 3g\nBáo sale', 'Lô 01/10 xuất cho CH Nguyễn Trãi 50 gói, CH Lê Lợi 30 gói, CH Hai Bà Trưng 20 gói; lô 02/10 giữ lại kho chờ sale báo. Không xuất lẻ dưới 5 gói. Báo lại sale trước 15h. Lô 03/10 chuyển CH Quận 7 toàn bộ, chụp ảnh gửi nhóm.', 'https://zalo.me/g/abcdefghijklmnopqrstuvwxyz0123456789abcdefghijk']
    const count = 5 + Math.floor(random() * 45)
    const report: NearDateReportProduct[] = Array.from({ length: count }, (_, index) => ({
      productCode: `SP${index}`, productName: `P${index}`, vietnameseName: `Xúc xích ${index}${random() < 0.5 ? ' vị đặc biệt dành cho hệ thống kho lạnh trung tâm phía Nam loại lớn' : ''}`,
      packaging: '', productGroup: ['Hàng đông lạnh', 'Hàng chill', 'Hàng thường', 'Xúc xích tiệt trùng'][Math.floor(random() * 4)], saleNote: random() < 0.6 ? notes[Math.floor(random() * 5)] : '',
      isNewDate: random() < 0.5,
      lots: Array.from({ length: Math.floor(random() * (random() < 0.15 ? 14 : 4)) }, (_, lotIndex) => ({ productionDate: `2026-10-${String(lotIndex + 1).padStart(2, '0')}`, quantityPacks: random() < 0.1 ? null : 100 * lotIndex + 5, datePercent: 30 + lotIndex })),
    }))
    const tuning = { densityLevel: Math.floor(random() * 5) - 2, fontLevel: Math.floor(random() * 4) - 1 }
    const printMode = random() < 0.5 ? 'monochrome' as const : 'color' as const
    const emphasis = report.filter(() => random() < 0.3).flatMap((item) => [reportEmphasisKey(item.productCode, 'saleNote'), reportEmphasisKey(item.productCode, 'productName')])
    return { report, tuning, printMode, emphasis }
  }

  it('không đẩy dòng cuối của trang sang một trang gần trống khi có ghi chú Sale', async () => {
    // These seeds used to render one more page than estimated: a long link in a note gave the
    // note column a different width when measuring than when drawing.
    for (const seed of [3, 15, 25, 28].map((value) => value * 13 + 5)) {
      const { report, tuning, printMode, emphasis } = randomReport(seed)
      const estimated = await estimateOptimizedPageCount(report, '2026-10-22', printMode, tuning, emphasis, 3)
      const pdf = await createNearDatePdfBlob(report, '2026-10-22', 'portrait', printMode, 'optimized', tuning, emphasis, 3)
      expect(pdfPageCount(Buffer.from(await pdf.arrayBuffer())), `seed ${seed}`).toBe(estimated)
    }
  }, 120_000)
})
