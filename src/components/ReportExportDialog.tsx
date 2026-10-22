import { useEffect, useMemo, useState } from 'react'
import { Download, FileText, LoaderCircle, Minus, Palette, Plus, Printer, RotateCcw, X } from 'lucide-react'
import { formatDate } from '../lib/date'
import { createNearDatePdfBlob, estimateOptimizedPageCount, exportNearDateReport, prepareNearDateReport, resolveReportOrientation } from '../lib/reportExport'
import type { ReportLayoutMode, ReportOrientation, ReportPrintMode, ReportTuning } from '../lib/reportExport'
import type { ComparedProduct, Product } from '../types'

type ReportExportDialogProps = {
  rows: ComparedProduct[]
  products: Product[]
  date: string
  onClose: () => void
  notify: (message: string, error?: boolean) => void
}

export function ReportExportDialog({ rows, products, date, onClose, notify }: ReportExportDialogProps) {
  const [orientation, setOrientation] = useState<ReportOrientation>('auto')
  const [printMode, setPrintMode] = useState<ReportPrintMode>('monochrome')
  const [layoutMode, setLayoutMode] = useState<ReportLayoutMode>('optimized')
  const [densityLevel, setDensityLevel] = useState(0)
  const [fontLevel, setFontLevel] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string>()
  const [previewError, setPreviewError] = useState(false)
  const [exporting, setExporting] = useState<'docx' | 'pdf'>()
  const report = useMemo(() => prepareNearDateReport(rows, products), [rows, products])
  const lotCount = useMemo(() => report.reduce((sum, item) => sum + item.lots.length, 0), [report])
  const actualOrientation = useMemo(() => resolveReportOrientation(report, orientation, layoutMode), [report, orientation, layoutMode])
  const tuning = useMemo<ReportTuning>(()=>({densityLevel,fontLevel}),[densityLevel,fontLevel])
  const estimatedPageCount = useMemo(() => estimateOptimizedPageCount(report, orientation,tuning), [report, orientation,tuning])
  const densityLabel = ['Rất gọn','Gọn','Tiêu chuẩn','Thoáng','Rất thoáng'][densityLevel+2]
  const fontPercent = [92,100,110,120][fontLevel+1]
  const layoutLabel = layoutMode === 'optimized' ? 'tối ưu A4' : layoutMode === 'compact' ? 'bản kho gọn' : 'bản chi tiết'

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | undefined
    setPreviewUrl(undefined)
    setPreviewError(false)
    void createNearDatePdfBlob(report, date, orientation, printMode, layoutMode,tuning)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob)
        if (cancelled) URL.revokeObjectURL(objectUrl)
        else setPreviewUrl(objectUrl)
      })
      .catch((error) => {
        console.error(error)
        if (!cancelled) setPreviewError(true)
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [report, date, orientation, printMode, layoutMode,tuning])

  const runExport = async (type: 'docx' | 'pdf') => {
    setExporting(type)
    try {
      await exportNearDateReport(rows, date, type, products, orientation, printMode, layoutMode,tuning)
      notify(`Đã tạo file ${type === 'docx' ? 'Word' : 'PDF'} ${layoutLabel}, khổ ${actualOrientation === 'portrait' ? 'dọc' : 'ngang'}${layoutMode === 'optimized' ? `, dự kiến ${estimatedPageCount} trang` : orientation === 'auto' ? ' tự động' : ''}${printMode === 'monochrome' ? ', tối ưu in trắng đen' : ', bản màu'}.`)
    } catch (error) {
      console.error(error)
      notify(`Không thể tạo file ${type === 'docx' ? 'Word' : 'PDF'}.`, true)
    } finally {
      setExporting(undefined)
    }
  }

  return <div className="fixed inset-0 z-[70] flex bg-slate-950/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="report-export-title">
    <div className="mx-auto flex min-h-0 w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl">
      <header className="flex flex-wrap items-center gap-4 border-b px-5 py-4">
        <div className="min-w-64 flex-1">
          <h2 id="report-export-title" className="text-lg font-bold text-slate-900">Xem trước và xuất báo cáo</h2>
          <p className="mt-0.5 text-xs text-slate-500">Ngày {formatDate(date)} · {report.length} mã · {lotCount} dòng NSX</p>
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1" aria-label="Bố cục báo cáo">
          <button type="button" aria-pressed={layoutMode === 'optimized'} className={`h-10 rounded-lg px-3 text-sm font-semibold transition ${layoutMode === 'optimized' ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-900'}`} onClick={() => setLayoutMode('optimized')}>Tối ưu A4</button>
          <button type="button" aria-pressed={layoutMode === 'compact'} className={`h-10 rounded-lg px-3 text-sm font-semibold transition ${layoutMode === 'compact' ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-900'}`} onClick={() => setLayoutMode('compact')}>Bản kho gọn</button>
          <button type="button" aria-pressed={layoutMode === 'detailed'} className={`h-10 rounded-lg px-3 text-sm font-semibold transition ${layoutMode === 'detailed' ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-900'}`} onClick={() => setLayoutMode('detailed')}>Bản chi tiết</button>
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1" aria-label="Chế độ in">
          <button type="button" aria-pressed={printMode === 'monochrome'} className={`flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition ${printMode === 'monochrome' ? 'bg-white text-slate-950 shadow-sm ring-1 ring-slate-300' : 'text-slate-600 hover:text-slate-900'}`} onClick={() => setPrintMode('monochrome')}><Printer size={16}/>Trắng đen <span className="hidden text-[10px] font-bold uppercase text-slate-400 xl:inline">Khuyên dùng</span></button>
          <button type="button" aria-pressed={printMode === 'color'} className={`flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition ${printMode === 'color' ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-900'}`} onClick={() => setPrintMode('color')}><Palette size={16}/>Bản màu</button>
        </div>
        {layoutMode === 'optimized' ? <div className="flex h-12 items-center gap-2 rounded-xl bg-emerald-50 px-3 text-sm font-bold text-emerald-800 ring-1 ring-emerald-200" aria-label="Hướng giấy A4 dọc cố định">
          <span className="block h-5 w-3.5 rounded-sm border-2 border-emerald-700" aria-hidden="true"/>
          A4 dọc cố định
        </div> : <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1" aria-label="Hướng giấy">
          {(['auto', 'portrait', 'landscape'] as const).map((value) => <button
            key={value}
            type="button"
            aria-pressed={orientation === value}
            className={`flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition ${orientation === value ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-900'}`}
            onClick={() => setOrientation(value)}
          >
            <span className={`block rounded-sm border-2 ${value === 'portrait' ? 'h-5 w-3.5' : value === 'landscape' ? 'h-3.5 w-5' : 'h-4 w-4'} ${orientation === value ? 'border-brand-600' : 'border-slate-400'}`} aria-hidden="true"/>
            {value === 'auto' ? 'Tự động' : value === 'portrait' ? 'Dọc' : 'Ngang'}
          </button>)}
        </div>}
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Đóng"><X size={18}/></button>
      </header>

      {layoutMode==='optimized'&&<div className="flex flex-wrap items-center gap-3 border-b bg-slate-50 px-5 py-3">
        <div className="flex items-center gap-2"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">Mật độ dòng</span><div className="flex items-center gap-1 rounded-lg border bg-white p-1"><button type="button" className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40" disabled={densityLevel<=-2} onClick={()=>setDensityLevel((value)=>Math.max(-2,value-1))}><Minus size={14}/>Co dòng</button><span className="min-w-20 text-center text-xs font-bold text-brand-700">{densityLabel}</span><button type="button" className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40" disabled={densityLevel>=2} onClick={()=>setDensityLevel((value)=>Math.min(2,value+1))}><Plus size={14}/>Giãn dòng</button></div></div>
        <div className="flex items-center gap-2"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">Cỡ chữ</span><div className="flex items-center gap-1 rounded-lg border bg-white p-1"><button type="button" className="icon-btn h-8 w-8" title="Giảm cỡ chữ" aria-label="Giảm cỡ chữ" disabled={fontLevel<=-1} onClick={()=>setFontLevel((value)=>Math.max(-1,value-1))}><Minus size={14}/></button><span className="min-w-12 text-center text-xs font-bold text-brand-700">{fontPercent}%</span><button type="button" className="icon-btn h-8 w-8" title="Tăng cỡ chữ" aria-label="Tăng cỡ chữ" disabled={fontLevel>=2} onClick={()=>setFontLevel((value)=>Math.min(2,value+1))}><Plus size={14}/></button></div></div>
        <button type="button" className="btn-secondary h-9" disabled={densityLevel===0&&fontLevel===0} onClick={()=>{setDensityLevel(0);setFontLevel(0)}}><RotateCcw size={14}/>Mặc định</button>
        <div className={`ml-auto rounded-lg px-3 py-2 text-sm font-bold ring-1 ${estimatedPageCount>2?'bg-amber-50 text-amber-800 ring-amber-200':'bg-emerald-50 text-emerald-800 ring-emerald-200'}`}>Dự kiến {estimatedPageCount} trang A4 dọc</div>
      </div>}

      <div className="relative min-h-[420px] flex-1 bg-slate-800 p-3 sm:p-5">
        {!previewUrl && !previewError && <div className="absolute inset-0 grid place-items-center text-white"><div className="flex items-center gap-2 rounded-xl bg-slate-900/70 px-4 py-3 text-sm"><LoaderCircle className="animate-spin" size={18}/>Đang dựng {layoutLabel} {printMode === 'monochrome' ? 'trắng đen' : 'màu'}, khổ {actualOrientation === 'portrait' ? 'dọc' : 'ngang'}…</div></div>}
        {previewError && <div className="grid h-full place-items-center text-center text-white"><div><p className="font-semibold">Không thể tạo bản xem trước.</p><button type="button" className="mt-3 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-800" onClick={() => setOrientation(actualOrientation === 'portrait' ? 'landscape' : 'portrait')}>Thử hướng giấy còn lại</button></div></div>}
        {previewUrl && <iframe className="h-full min-h-[420px] w-full rounded-lg border-0 bg-white" src={`${previewUrl}#toolbar=0&navpanes=0`} title="Bản xem trước báo cáo cận date"/>}
      </div>

      <footer className="flex flex-wrap items-center gap-3 border-t bg-white px-5 py-4">
        <div className="min-w-64 flex-1 text-xs text-slate-500">
          <p>{layoutMode === 'optimized' ? 'Đang tối ưu thích ứng trên A4 dọc, sát lề an toàn 4 mm. Báo cáo tự dùng 1, 2 hoặc nhiều trang theo lượng dữ liệu và mức điều chỉnh.' : 'Bản kho gọn dùng một bảng liên tục và đặt ghi chú Sale ở cột cuối bên phải.'} Bản xem trước là file PDF thật.</p>
          {layoutMode === 'optimized' && <p className={`mt-1 font-bold ${estimatedPageCount > 2 ? 'text-amber-700' : 'text-emerald-700'}`}>
            Dự kiến {estimatedPageCount} trang{estimatedPageCount > 2 ? ' — dữ liệu lớn nên hệ thống không ép chữ nhỏ hơn mức an toàn.' : estimatedPageCount===1?' — dữ liệu vừa một trang, không chia trang không cần thiết.':' — đạt mục tiêu tối đa 2 trang.'}
          </p>}
        </div>
        <button type="button" className="btn-secondary" onClick={onClose}>Đóng</button>
        <button type="button" className="btn-secondary" disabled={Boolean(exporting)} onClick={() => void runExport('docx')}><FileText size={16}/>{exporting === 'docx' ? 'Đang tạo Word…' : 'Xuất Word'}</button>
        <button type="button" className="btn-primary" disabled={Boolean(exporting)} onClick={() => void runExport('pdf')}><Download size={16}/>{exporting === 'pdf' ? 'Đang tạo PDF…' : 'Xuất PDF'}</button>
      </footer>
    </div>
  </div>
}
