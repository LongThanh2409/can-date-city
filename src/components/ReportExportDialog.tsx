import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Download, FileText, LoaderCircle, Minus, Palette, Plus, Printer, RotateCcw, Sparkles, X } from 'lucide-react'
import { formatDate } from '../lib/date'
import { createNearDatePdfBlob, estimateOptimizedPageCount, exportNearDateReport, prepareNearDateReport, reportEmphasisKey, resolveReportOrientation } from '../lib/reportExport'
import type { ReportEmphasisSuggestion, ReportLayoutMode, ReportOrientation, ReportPageTarget, ReportPrintMode, ReportTuning } from '../lib/reportExport'
import type { ComparedProduct, Product } from '../types'
import { analyzeReportEmphasis } from '../services/gemini'

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
  const [pageTarget, setPageTarget] = useState<ReportPageTarget>(2)
  const [previewUrl, setPreviewUrl] = useState<string>()
  const [previewBusy, setPreviewBusy] = useState(false)
  const [previewError, setPreviewError] = useState(false)
  const [exporting, setExporting] = useState<'docx' | 'pdf'>()
  const [analyzing,setAnalyzing]=useState(false)
  const [aiError,setAiError]=useState('')
  const [aiProgress,setAiProgress]=useState('')
  const [aiSuggestions,setAiSuggestions]=useState<ReportEmphasisSuggestion[]>([])
  const [selectedEmphasis,setSelectedEmphasis]=useState<string[]>([])
  const [aiPanelOpen,setAiPanelOpen]=useState(false)
  const [aiModel,setAiModel]=useState('')
  const previewUrlRef=useRef<string | undefined>(undefined)
  const report = useMemo(() => prepareNearDateReport(rows, products), [rows, products])
  const reportSignature=useMemo(()=>JSON.stringify(report),[report])
  const [analyzedSignature,setAnalyzedSignature]=useState('')
  const lotCount = useMemo(() => report.reduce((sum, item) => sum + item.lots.length, 0), [report])
  const actualOrientation = useMemo(() => resolveReportOrientation(report, orientation, layoutMode), [report, orientation, layoutMode])
  const tuning = useMemo<ReportTuning>(()=>({densityLevel,fontLevel}),[densityLevel,fontLevel])
  const [estimatedPageCount,setEstimatedPageCount]=useState<number>()
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
    let generatedUrl: string | undefined
    setPreviewBusy(true)
    const timer=window.setTimeout(()=>void createNearDatePdfBlob(report, date, orientation, printMode, layoutMode,tuning,selectedEmphasis,pageTarget)
      .then((blob) => {
        generatedUrl = URL.createObjectURL(blob)
        if (cancelled) URL.revokeObjectURL(generatedUrl)
        else {
          if(previewUrlRef.current)URL.revokeObjectURL(previewUrlRef.current)
          previewUrlRef.current=generatedUrl
          setPreviewUrl(generatedUrl)
          setPreviewError(false)
          setPreviewBusy(false)
        }
      })
      .catch((error) => {
        console.error(error)
        if (!cancelled){setPreviewError(true);setPreviewBusy(false)}
      }),220)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [report, date, orientation, printMode, layoutMode,tuning,selectedEmphasis,pageTarget])

  useEffect(()=>()=>{if(previewUrlRef.current)URL.revokeObjectURL(previewUrlRef.current)},[])

  useEffect(()=>{
    if(layoutMode!=='optimized')return
    let cancelled=false
    setEstimatedPageCount(undefined)
    estimateOptimizedPageCount(report,date,printMode,tuning,selectedEmphasis,pageTarget)
      .then((count)=>{if(!cancelled)setEstimatedPageCount(count)})
      .catch((error)=>console.error(error))
    return ()=>{cancelled=true}
  },[report,date,printMode,tuning,selectedEmphasis,pageTarget,layoutMode])

  useEffect(()=>{
    if(analyzedSignature&&analyzedSignature!==reportSignature){setAiSuggestions([]);setSelectedEmphasis([]);setAiPanelOpen(false);setAnalyzedSignature('');notify('Dữ liệu báo cáo đã thay đổi. Đề xuất tô đậm AI cũ đã được bỏ để tránh áp dụng sai.')}
  },[analyzedSignature,reportSignature,notify])

  function suggestionKeys(suggestion:ReportEmphasisSuggestion) {
    return [
      ...suggestion.fields.map((field)=>reportEmphasisKey(suggestion.productCode,field)),
      ...suggestion.lots.flatMap((lot)=>lot.fields.map((field)=>reportEmphasisKey(suggestion.productCode,field,lot.productionDate,lot.datePercent))),
    ]
  }

  function normalizeSuggestions(raw:ReportEmphasisSuggestion[]) {
    const allowedProductFields=new Set(['productCode','productName','saleNote'])
    const allowedLotFields=new Set(['productionDate','datePercent'])
    return raw.flatMap((suggestion):ReportEmphasisSuggestion[]=>{
      const item=report.find((product)=>product.productCode===suggestion?.productCode)
      if(!item)return[]
      const fields=Array.isArray(suggestion.fields)?suggestion.fields.filter((field)=>allowedProductFields.has(field)):[]
      const lots=Array.isArray(suggestion.lots)?suggestion.lots.flatMap((lot)=>{
        const match=item.lots.find((candidate)=>candidate.productionDate===lot?.productionDate&&candidate.datePercent===lot?.datePercent)
        if(!match)return[]
        const lotFields=Array.isArray(lot.fields)?lot.fields.filter((field)=>allowedLotFields.has(field)):[]
        return lotFields.length?[{productionDate:match.productionDate,datePercent:match.datePercent,fields:lotFields as Array<'productionDate'|'datePercent'>}]:[]
      }):[]
      if(!fields.length&&!lots.length)return[]
      return [{productCode:item.productCode,fields:fields as ReportEmphasisSuggestion['fields'],lots,reason:typeof suggestion.reason==='string'?suggestion.reason.slice(0,300):'Cần thủ kho chú ý.'}]
    })
  }

  async function runAiAnalysis() {
    setAnalyzing(true);setAiError('');setAiProgress('Đang kiểm tra App Check…')
    try{
      const result=await analyzeReportEmphasis(report,(completed,total)=>setAiProgress(total>1?`Đã phân tích ${completed}/${total} phần dữ liệu`:'Đang hoàn tất kết quả…'))
      const suggestions=normalizeSuggestions(result.suggestions)
      const selected=[...new Set(suggestions.flatMap(suggestionKeys))]
      setAiSuggestions(suggestions);setSelectedEmphasis(selected);setAiModel(result.model);setAiPanelOpen(true);setAnalyzedSignature(reportSignature)
      notify(suggestions.length?`Gemini đề xuất tô đậm ${suggestions.length} mã. Hãy kiểm tra trước khi xuất.`:'Gemini không thấy mục nào cần tô đậm đặc biệt.')
    }catch(error){console.error(error);const message=error instanceof Error?error.message:'Không thể phân tích bằng Gemini.';setAiError(message);notify(message,true)}finally{setAnalyzing(false);setAiProgress('')}
  }

  function toggleSuggestion(suggestion:ReportEmphasisSuggestion) {
    const keys=suggestionKeys(suggestion)
    const enabled=keys.some((key)=>selectedEmphasis.includes(key))
    setSelectedEmphasis((current)=>enabled?current.filter((key)=>!keys.includes(key)):[...new Set([...current,...keys])])
  }

  const runExport = async (type: 'docx' | 'pdf') => {
    setExporting(type)
    try {
      await exportNearDateReport(rows, date, type, products, orientation, printMode, layoutMode,tuning,selectedEmphasis,pageTarget)
      notify(`Đã tạo file ${type === 'docx' ? 'Word' : 'PDF'} ${layoutLabel}, khổ ${actualOrientation === 'portrait' ? 'dọc' : 'ngang'}${layoutMode === 'optimized' && estimatedPageCount ? `, ${estimatedPageCount} trang` : orientation === 'auto' ? ' tự động' : ''}${printMode === 'monochrome' ? ', tối ưu in trắng đen' : ', bản màu'}.`)
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

      <div className="border-b bg-violet-50/70 px-5 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={`btn-primary border-violet-700 bg-violet-700 hover:bg-violet-800 ${analyzing?'ai-loading-border':''}`} disabled={analyzing||!report.length} onClick={()=>void runAiAnalysis()}>{analyzing?<LoaderCircle className="animate-spin" size={16}/>:<Sparkles size={16}/>} {analyzing?'Gemini đang phân tích…':aiSuggestions.length?'Phân tích lại cách tô đậm':'AI đề xuất tô đậm'}</button>
          <div className="min-w-56 flex-1"><p className="text-sm font-semibold text-violet-950">{analyzing&&aiProgress?aiProgress:'Áp dụng trực tiếp lên bản preview hiện tại'}</p><p className="text-xs text-violet-700">Không tạo bản mới, không sửa mã, ngày, % date hay ghi chú.</p></div>
          {aiSuggestions.length>0&&<><span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-violet-700 ring-1 ring-violet-200">{aiSuggestions.filter((suggestion)=>suggestionKeys(suggestion).some((key)=>selectedEmphasis.includes(key))).length}/{aiSuggestions.length} mã đang áp dụng</span><button type="button" className="btn-secondary h-9 border-violet-200 text-violet-700" onClick={()=>setAiPanelOpen(!aiPanelOpen)}>Kiểm tra đề xuất <ChevronDown className={`transition ${aiPanelOpen?'rotate-180':''}`} size={15}/></button><button type="button" className="btn-secondary h-9" disabled={!selectedEmphasis.length} onClick={()=>setSelectedEmphasis([])}><RotateCcw size={14}/>Bỏ toàn bộ tô đậm AI</button></>}
        </div>
        {aiError&&<div className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert"><span><strong>AI chưa chạy được:</strong> {aiError}</span><button type="button" className="shrink-0 text-xs font-bold underline" onClick={()=>setAiError('')}>Đóng</button></div>}
        {aiPanelOpen&&aiSuggestions.length>0&&<div className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-violet-200 bg-white shadow-sm"><div className="sticky top-0 flex items-center justify-between border-b bg-white px-4 py-2 text-xs text-slate-500"><span>Chọn các đề xuất muốn áp dụng vào preview và file xuất</span>{aiModel&&<span>{aiModel}</span>}</div><div className="divide-y">{aiSuggestions.map((suggestion,index)=>{const keys=suggestionKeys(suggestion);const enabled=keys.some((key)=>selectedEmphasis.includes(key));return <button type="button" className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-violet-50" key={`${suggestion.productCode}-${index}`} onClick={()=>toggleSuggestion(suggestion)}><span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border ${enabled?'border-violet-600 bg-violet-600 text-white':'border-slate-300 bg-white'}`}>{enabled&&<Check size={13}/>}</span><span className="min-w-24 font-bold text-brand-700">{suggestion.productCode}</span><span className="flex-1"><span className="block text-sm text-slate-800">{suggestion.reason}</span><span className="mt-0.5 block text-xs text-slate-500">Tô đậm: {[...suggestion.fields,...suggestion.lots.flatMap((lot)=>lot.fields.map((field)=>`${field} ${formatDate(lot.productionDate)}`))].join(', ')}</span></span></button>})}</div></div>}
      </div>

      {layoutMode==='optimized'&&<div className="flex flex-wrap items-center gap-3 border-b bg-slate-50 px-5 py-3">
        <div className="flex items-center gap-2"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">Mục tiêu</span><div className="flex items-center gap-1 rounded-lg border bg-white p-1">{([2,3] as const).map((value)=><button key={value} type="button" aria-pressed={pageTarget===value} className={`h-8 rounded-md px-3 text-xs font-bold transition ${pageTarget===value?'bg-brand-600 text-white shadow-sm':'text-slate-600 hover:bg-slate-100'}`} onClick={()=>setPageTarget(value)}>Tối ưu {value} trang</button>)}</div></div>
        <div className="flex items-center gap-2"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">Mật độ dòng</span><div className="flex items-center gap-1 rounded-lg border bg-white p-1"><button type="button" className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40" disabled={densityLevel<=-2} onClick={()=>setDensityLevel((value)=>Math.max(-2,value-1))}><Minus size={14}/>Co dòng</button><span className="min-w-20 text-center text-xs font-bold text-brand-700">{densityLabel}</span><button type="button" className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40" disabled={densityLevel>=2} onClick={()=>setDensityLevel((value)=>Math.min(2,value+1))}><Plus size={14}/>Giãn dòng</button></div></div>
        <div className="flex items-center gap-2"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">Cỡ chữ</span><div className="flex items-center gap-1 rounded-lg border bg-white p-1"><button type="button" className="icon-btn h-8 w-8" title="Giảm cỡ chữ" aria-label="Giảm cỡ chữ" disabled={fontLevel<=-1} onClick={()=>setFontLevel((value)=>Math.max(-1,value-1))}><Minus size={14}/></button><span className="min-w-12 text-center text-xs font-bold text-brand-700">{fontPercent}%</span><button type="button" className="icon-btn h-8 w-8" title="Tăng cỡ chữ" aria-label="Tăng cỡ chữ" disabled={fontLevel>=2} onClick={()=>setFontLevel((value)=>Math.min(2,value+1))}><Plus size={14}/></button></div></div>
        <button type="button" className="btn-secondary h-9" disabled={densityLevel===0&&fontLevel===0} onClick={()=>{setDensityLevel(0);setFontLevel(0)}}><RotateCcw size={14}/>Mặc định</button>
        <div className={`ml-auto rounded-lg px-3 py-2 text-sm font-bold ring-1 ${estimatedPageCount===undefined?'bg-slate-100 text-slate-600 ring-slate-200':estimatedPageCount>pageTarget?'bg-amber-50 text-amber-800 ring-amber-200':'bg-emerald-50 text-emerald-800 ring-emerald-200'}`}>Dự kiến {estimatedPageCount??'…'} trang A4 dọc · mục tiêu {pageTarget}</div>
      </div>}

      <div className="relative min-h-[420px] flex-1 bg-slate-800 p-3 sm:p-5">
        {!previewUrl && !previewError && <div className="absolute inset-0 grid place-items-center text-white"><div className="flex items-center gap-2 rounded-xl bg-slate-900/70 px-4 py-3 text-sm"><LoaderCircle className="animate-spin" size={18}/>Đang dựng {layoutLabel} {printMode === 'monochrome' ? 'trắng đen' : 'màu'}, khổ {actualOrientation === 'portrait' ? 'dọc' : 'ngang'}…</div></div>}
        {previewError && <div className="grid h-full place-items-center text-center text-white"><div><p className="font-semibold">Không thể tạo bản xem trước.</p><button type="button" className="mt-3 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-800" onClick={() => setOrientation(actualOrientation === 'portrait' ? 'landscape' : 'portrait')}>Thử hướng giấy còn lại</button></div></div>}
        {previewUrl && <iframe className="h-full min-h-[420px] w-full rounded-lg border-0 bg-white" src={`${previewUrl}#toolbar=0&navpanes=0`} title="Bản xem trước báo cáo cận date"/>}
        {previewUrl&&previewBusy&&<div className="pointer-events-none absolute right-6 top-6 flex items-center gap-2 rounded-lg bg-slate-950/80 px-3 py-2 text-xs font-semibold text-white shadow-lg"><LoaderCircle className="animate-spin" size={14}/>Đang cập nhật preview…</div>}
      </div>

      <footer className="flex flex-wrap items-center gap-3 border-t bg-white px-5 py-4">
        <div className="min-w-64 flex-1 text-xs text-slate-500">
          <p>{layoutMode === 'optimized' ? `Đang tối ưu thích ứng trên A4 dọc, lề ngang khoảng 3,5 mm và mục tiêu ${pageTarget} trang.` : 'Bản kho gọn dùng một bảng liên tục và đặt ghi chú Sale ở cột cuối bên phải.'} Bản xem trước là file PDF thật.</p>
          {layoutMode === 'optimized' && estimatedPageCount !== undefined && <p className={`mt-1 font-bold ${estimatedPageCount > pageTarget ? 'text-amber-700' : 'text-emerald-700'}`}>
            Dự kiến {estimatedPageCount} trang{estimatedPageCount > pageTarget ? ' — dữ liệu lớn nên hệ thống không ép chữ nhỏ hơn mức an toàn.' : estimatedPageCount===1?' — dữ liệu vừa một trang, không chia trang không cần thiết.':` — đạt mục tiêu tối đa ${pageTarget} trang.`}
          </p>}
        </div>
        <button type="button" className="btn-secondary" onClick={onClose}>Đóng</button>
        <button type="button" className="btn-secondary" disabled={Boolean(exporting)} onClick={() => void runExport('docx')}><FileText size={16}/>{exporting === 'docx' ? 'Đang tạo Word…' : 'Xuất Word'}</button>
        <button type="button" className="btn-primary" disabled={Boolean(exporting)} onClick={() => void runExport('pdf')}><Download size={16}/>{exporting === 'pdf' ? 'Đang tạo PDF…' : 'Xuất PDF'}</button>
      </footer>
    </div>
  </div>
}
