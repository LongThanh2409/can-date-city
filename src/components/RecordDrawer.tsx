import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Plus, Save, Trash2, X } from 'lucide-react'
import { validateLots } from '../domain/validation'
import { formatDate } from '../lib/date'
import { PRODUCT_GROUP_LABELS, lotQuantityInPacks, packagingSummary, quantityBreakdownFromLot, quantityBreakdownToPacks, quantityEntryUnits } from '../domain/product'
import { deleteDateRecord, saveDateRecord } from '../services/firestore'
import type { DateRecord, Lot, Product, QuantityUnitKey } from '../types'

const newLot = (): Lot => ({ lotId: crypto.randomUUID(), productionDate: '', quantity: 0, unit: 'gói', quantityBreakdown: { packs:0 }, datePercent: 0, lotLabel: '' })

export function RecordDrawer({ product, chatDate, current, previous, previousDate, canViewPreviousInline, startWithNewLot = false, userId, onClose, notify }: { product: Product; chatDate: string; current?: DateRecord; previous?: DateRecord; previousDate: string; canViewPreviousInline: boolean; startWithNewLot?: boolean; userId: string; onClose: () => void; notify: (message: string, error?: boolean) => void }) {
  const quantityUnits = quantityEntryUnits(product)
  const [lots, setLots] = useState<Lot[]>(()=>{
    const existingLots = current?.lots.map((lot)=>{const quantityBreakdown=quantityBreakdownFromLot(lot);const total=quantityBreakdownToPacks(quantityBreakdown,product);return {...lot,quantity:total??lot.quantity,unit:total===null?lot.unit:'gói',quantityBreakdown}}) ?? []
    return existingLots.length ? [...existingLots, ...(startWithNewLot ? [newLot()] : [])] : [newLot()]
  })
  const [isNewDate, setIsNewDate] = useState(current?.isNewDate ?? false)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [dirty, setDirty] = useState(startWithNewLot)
  const expectedUpdatedAt = current?.updatedAt?.toDate?.().toISOString()
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }
    window.addEventListener('beforeunload', beforeUnload); return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])
  const close = () => { if (!dirty || confirm('Dữ liệu chưa lưu sẽ bị mất. Đóng vùng nhập?')) onClose() }
  const duplicateDates = useMemo(()=>new Set(lots.filter((lot,i)=>lots.some((other,j)=>j!==i&&other.productionDate===lot.productionDate)).map(l=>l.productionDate)),[lots])
  const update = (index: number, patch: Partial<Lot>) => { setLots(lots.map((lot,i)=>i===index?{...lot,...patch}:lot)); setDirty(true) }
  const updateQuantity = (index: number, key: QuantityUnitKey, value: number) => {
    const quantityBreakdown = { ...quantityBreakdownFromLot(lots[index]), [key]:value }
    const quantity = quantityBreakdownToPacks(quantityBreakdown,product)
    update(index,{ quantityBreakdown, quantity:quantity??Number.NaN, unit:'gói' })
  }
  async function save(force = false) {
    const validation = validateLots(lots, ['gói']); setErrors(validation); if (validation.length) return
    setBusy(true)
    const id = `${chatDate}_${product.id}`
    const record = { id, chatDate, productId: product.id, productCode: product.productCode, productName: product.productName, vietnameseName: product.vietnameseName, isNewDate, saleNote: current?.saleNote ?? '', lots, createdBy: current?.createdBy ?? userId, updatedBy: userId }
    try { await saveDateRecord({ record, expectedUpdatedAt, force }); setDirty(false); notify('Firestore đã xác nhận lưu dữ liệu.'); onClose() }
    catch (error) {
      if (error instanceof Error && error.message === 'CONFLICT') {
        if (confirm('Bản ghi đã được người khác cập nhật. Tải lại trang để xem dữ liệu mới. Bạn vẫn muốn ghi đè?')) await save(true)
      } else notify('Không thể lưu dữ liệu vào Firestore.', true)
    } finally { setBusy(false) }
  }
  return <div className="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-[2px]" role="dialog" aria-modal="true">
    <aside className="ml-auto flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
      <header className="border-b bg-brand-900 px-6 py-5 text-white"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-widest text-teal-200">{current?'Chỉnh sửa dữ liệu':'Nhập nhanh'}</p><h2 className="mt-1 text-2xl font-bold">{product.productCode}</h2><p className="text-sm text-teal-50/80">{product.vietnameseName||product.productName||'Chưa bổ sung tên'} · Ngày chát {formatDate(chatDate)}</p></div><button className="icon-btn border-white/20 bg-white/10 text-white hover:bg-white/20" onClick={close}><X/></button></div></header>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <section className="mb-5 grid grid-cols-[1fr_2fr] gap-3 rounded-xl border bg-slate-50 p-4"><div><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Nhóm hàng</p><p className="mt-1 font-semibold">{PRODUCT_GROUP_LABELS[product.productGroup]}</p></div><div><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Quy cách</p><p className="mt-1 font-semibold text-brand-700">{packagingSummary(product)}</p>{product.packaging.note&&product.packaging.type!=='carton-only'&&<p className="text-xs text-slate-500">{product.packaging.note}</p>}</div></section>
        <label className={`mb-6 flex cursor-pointer items-center gap-4 rounded-xl border-2 p-4 ${isNewDate?'border-blue-500 bg-blue-50':'border-slate-200 bg-slate-50'}`}><input className="h-6 w-6 accent-blue-600" type="checkbox" checked={isNewDate} onChange={(e)=>{setIsNewDate(e.target.checked);setDirty(true)}}/><span><strong className="block">{isNewDate?'MỚI':'KHÔNG MỚI'}</strong><small className="text-slate-500">Trạng thái do người nhập chủ động đánh dấu, độc lập với phát hiện lô mới.</small></span></label>
        <div className="space-y-4">{lots.map((lot,index)=>{const breakdown=quantityBreakdownFromLot(lot);const total=quantityBreakdownToPacks(breakdown,product);return <section key={lot.lotId} className="rounded-xl border bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between"><h3 className="font-bold">Lô {index+1}</h3><button className="icon-btn text-rose-600" disabled={lots.length===1} onClick={()=>{if(confirm('Xóa lô này khỏi bản nhập?')){setLots(lots.filter((_,i)=>i!==index));setDirty(true)}}}><Trash2 size={17}/></button></div><div className="grid grid-cols-2 gap-3 md:grid-cols-4"><div><label className="label">Ngày sản xuất *</label><input className="input" type="date" value={lot.productionDate} onChange={(e)=>update(index,{productionDate:e.target.value})}/></div><div className="col-span-2"><label className="label">Số lượng theo từng đơn vị</label><div className={`grid gap-2 ${quantityUnits.length>=3?'grid-cols-3':'grid-cols-2'}`}>{quantityUnits.map((unit)=><div key={unit.key}><span className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">{unit.label}</span><input className="input" type="number" min="0" step="any" value={breakdown[unit.key]??0} onChange={(event)=>updateQuantity(index,unit.key,Number(event.target.value))}/></div>)}</div><p className={`mt-2 rounded-md px-2 py-1 text-xs font-bold ${total===null?'bg-rose-50 text-rose-700':'bg-brand-50 text-brand-800'}`}>{total===null?'Chưa thể quy đổi: hãy bổ sung đầy đủ quy cách sản phẩm.':`Tổng quy đổi: ${total} gói`}</p></div><div><label className="label">% date *</label><input className="input" type="number" min="0" max="100" step="any" value={lot.datePercent} onChange={(e)=>update(index,{datePercent:Number(e.target.value)})}/></div></div><div className="mt-3"><label className="label">Mã lô / ghi chú {duplicateDates.has(lot.productionDate)&&<span className="text-amber-700">(bắt buộc vì trùng ngày)</span>}</label><input className="input" value={lot.lotLabel} onChange={(e)=>update(index,{lotLabel:e.target.value})} placeholder="Ví dụ: L01, kệ A…"/></div></section>})}</div>
        <button className="btn-secondary mt-4" onClick={()=>{setLots([...lots,newLot()]);setDirty(true)}}><Plus size={17}/>Thêm lô</button>
        {canViewPreviousInline&&<section className="mt-5 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-amber-800">Dữ liệu ngày hôm qua · {formatDate(previousDate)}</p><p className="mt-0.5 text-[11px] text-amber-700">Chỉ tài khoản admin nhìn thấy phần tham chiếu này.</p></div><span className="badge bg-amber-200 text-amber-900">ADMIN</span></div>{previous?<><div className="mt-3 rounded-lg border-2 border-violet-300 bg-violet-50 px-3 py-3"><p className="text-[11px] font-bold uppercase tracking-wide text-violet-800">Ghi chú Sale cho cả mã</p><p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-violet-950">{previous.saleNote?.trim()||'Chưa có ghi chú Sale.'}</p></div><div className="mt-3 space-y-2">{previous.lots.map((lot,index)=><div key={lot.lotId} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs"><strong className="text-amber-900">Lô {index+1}</strong><span>NSX <strong>{formatDate(lot.productionDate)}</strong></span><span><strong>{lotQuantityInPacks(lot,product)??'—'}</strong> gói</span><span><strong>{lot.datePercent}%</strong> date</span>{lot.lotLabel&&<span className="col-span-4 text-slate-500">Mã lô/Ghi chú: {lot.lotLabel}</span>}</div>)}</div></>:<p className="mt-3 rounded-lg border border-dashed border-amber-300 bg-white/70 px-3 py-4 text-center text-sm text-amber-800">Ngày hôm qua chưa ghi nhận mã sản phẩm này.</p>}</section>}
        {errors.length>0&&<div className="notice notice-error mt-5"><div className="flex items-center gap-2 font-bold"><AlertTriangle size={17}/>Kiểm tra dữ liệu</div><ul className="mt-1 list-disc pl-5">{errors.map(e=><li key={e}>{e}</li>)}</ul></div>}
        {current?.updatedAt&&<p className="mt-5 text-xs text-slate-500">Cập nhật gần nhất: {current.updatedAt.toDate().toLocaleString('vi-VN')} · {current.updatedBy}</p>}
      </div>
      <footer className="flex items-center justify-between border-t bg-slate-50 px-6 py-4"><div>{current&&<button className="btn-danger" onClick={async()=>{if(confirm(`Xóa dữ liệu ${product.productCode} ngày ${formatDate(chatDate)}?`)){await deleteDateRecord(current.id);notify('Đã xóa bản ghi.');onClose()}}}><Trash2 size={16}/>Xóa bản ghi</button>}</div><div className="flex gap-2"><button className="btn-secondary" onClick={close}>Hủy</button><button className="btn-primary" disabled={busy} onClick={()=>void save()}><Save size={17}/>{busy?'Đang lưu…':'Lưu'}</button></div></footer>
    </aside>
  </div>
}
