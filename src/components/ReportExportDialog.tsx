import { useEffect, useMemo, useState } from 'react'
import { Download, FileText, LoaderCircle, Palette, Printer, X } from 'lucide-react'
import { formatDate } from '../lib/date'
import { createNearDatePdfBlob, exportNearDateReport, prepareNearDateReport } from '../lib/reportExport'
import type { ReportLayoutMode, ReportOrientation, ReportPrintMode } from '../lib/reportExport'
import type { ComparedProduct, Product } from '../types'

type ReportExportDialogProps = {
  rows: ComparedProduct[]
  products: Product[]
  date: string
  onClose: () => void
  notify: (message: string, error?: boolean) => void
}

export function ReportExportDialog({ rows, products, date, onClose, notify }: ReportExportDialogProps) {
  const [orientation, setOrientation] = useState<ReportOrientation>('landscape')
  const [printMode, setPrintMode] = useState<ReportPrintMode>('monochrome')
  const [layoutMode, setLayoutMode] = useState<ReportLayoutMode>('compact')
  const [previewUrl, setPreviewUrl] = useState<string>()
  const [previewError, setPreviewError] = useState(false)
  const [exporting, setExporting] = useState<'docx' | 'pdf'>()
  const report = useMemo(() => prepareNearDateReport(rows, products), [rows, products])
  const lotCount = useMemo(() => report.reduce((sum, item) => sum + item.lots.length, 0), [report])

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
    void createNearDatePdfBlob(report, date, orientation, printMode, layoutMode)
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
  }, [report, date, orientation, printMode, layoutMode])

  const runExport = async (type: 'docx' | 'pdf') => {
    setExporting(type)
    try {
      await exportNearDateReport(rows, date, type, products, orientation, printMode, layoutMode)
      notify(`Đã tạo file ${type === 'docx' ? 'Word' : 'PDF'} ${layoutMode === 'compact' ? 'bản kho gọn' : 'bản chi tiết'}, khổ ${orientation === 'portrait' ? 'dọc' : 'ngang'}${printMode === 'monochrome' ? ', tối ưu in trắng đen' : ', bản màu'}.`)
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
          <button type="button" aria-pressed={layoutMode === 'compact'} className={`h-10 rounded-lg px-3 text-sm font-semibold transition ${layoutMode === 'compact' ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-900'}`} onClick={() => setLayoutMode('compact')}>Bản kho gọn</button>
          <button type="button" aria-pressed={layoutMode === 'detailed'} className={`h-10 rounded-lg px-3 text-sm font-semibold transition ${layoutMode === 'detailed' ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-900'}`} onClick={() => setLayoutMode('detailed')}>Bản chi tiết</button>
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1" aria-label="Chế độ in">
          <button type="button" aria-pressed={printMode === 'monochrome'} className={`flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition ${printMode === 'monochrome' ? 'bg-white text-slate-950 shadow-sm ring-1 ring-slate-300' : 'text-slate-600 hover:text-slate-900'}`} onClick={() => setPrintMode('monochrome')}><Printer size={16}/>Trắng đen <span className="hidden text-[10px] font-bold uppercase text-slate-400 xl:inline">Khuyên dùng</span></button>
          <button type="button" aria-pressed={printMode === 'color'} className={`flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition ${printMode === 'color' ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-900'}`} onClick={() => setPrintMode('color')}><Palette size={16}/>Bản màu</button>
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1" aria-label="Hướng giấy">
          {(['portrait', 'landscape'] as const).map((value) => <button
            key={value}
            type="button"
            aria-pressed={orientation === value}
            className={`flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition ${orientation === value ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-900'}`}
            onClick={() => setOrientation(value)}
          >
            <span className={`block rounded-sm border-2 ${value === 'portrait' ? 'h-5 w-3.5' : 'h-3.5 w-5'} ${orientation === value ? 'border-brand-600' : 'border-slate-400'}`} aria-hidden="true"/>
            {value === 'portrait' ? 'Dọc' : 'Ngang'}
          </button>)}
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Đóng"><X size={18}/></button>
      </header>

      <div className="relative min-h-[420px] flex-1 bg-slate-800 p-3 sm:p-5">
        {!previewUrl && !previewError && <div className="absolute inset-0 grid place-items-center text-white"><div className="flex items-center gap-2 rounded-xl bg-slate-900/70 px-4 py-3 text-sm"><LoaderCircle className="animate-spin" size={18}/>Đang dựng {layoutMode === 'compact' ? 'bản kho gọn' : 'bản chi tiết'} {printMode === 'monochrome' ? 'trắng đen' : 'màu'}, khổ {orientation === 'portrait' ? 'dọc' : 'ngang'}…</div></div>}
        {previewError && <div className="grid h-full place-items-center text-center text-white"><div><p className="font-semibold">Không thể tạo bản xem trước.</p><button type="button" className="mt-3 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-800" onClick={() => setOrientation((value) => value === 'portrait' ? 'landscape' : 'portrait')}>Thử hướng giấy còn lại</button></div></div>}
        {previewUrl && <iframe className="h-full min-h-[420px] w-full rounded-lg border-0 bg-white" src={`${previewUrl}#toolbar=0&navpanes=0`} title="Bản xem trước báo cáo cận date"/>}
      </div>

      <footer className="flex flex-wrap items-center gap-3 border-t bg-white px-5 py-4">
        <p className="min-w-64 flex-1 text-xs text-slate-500">Bản kho gọn dùng một bảng liên tục và đặt ghi chú Sale ở cột cuối bên phải. Bản xem trước là file PDF thật.</p>
        <button type="button" className="btn-secondary" onClick={onClose}>Đóng</button>
        <button type="button" className="btn-secondary" disabled={Boolean(exporting)} onClick={() => void runExport('docx')}><FileText size={16}/>{exporting === 'docx' ? 'Đang tạo Word…' : 'Xuất Word'}</button>
        <button type="button" className="btn-primary" disabled={Boolean(exporting)} onClick={() => void runExport('pdf')}><Download size={16}/>{exporting === 'pdf' ? 'Đang tạo PDF…' : 'Xuất PDF'}</button>
      </footer>
    </div>
  </div>
}
