import { Check, ChevronDown, PackageX, Pencil, Plus, Save, SearchX, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { validateLots } from '../domain/validation'
import { lotQuantityInPacks, packagingSummary, quantityBreakdownFromLot } from '../domain/product'
import { formatDate } from '../lib/date'
import { deleteDateRecord, saveDateRecord } from '../services/firestore'
import type { ComparedProduct, DateRecord, Lot, Product, UserRole } from '../types'

type InlineEdit = { rowKey: string; lot: Lot; isNewDate: boolean }

function recordInput(source: DateRecord, userId: string, changes: Partial<Pick<DateRecord, 'lots' | 'isNewDate' | 'saleNote'>> = {}): Omit<DateRecord, 'createdAt' | 'updatedAt'> {
  return {
    id: source.id,
    chatDate: source.chatDate,
    productId: source.productId,
    productCode: source.productCode,
    productName: source.productName,
    vietnameseName: source.vietnameseName,
    createdBy: source.createdBy,
    updatedBy: userId,
    lots: changes.lots ?? source.lots,
    isNewDate: changes.isNewDate ?? source.isNewDate,
    saleNote: changes.saleNote ?? source.saleNote ?? '',
  }
}

export function ComparisonTable({ rows, products, userId, role, onAddLot, notify }: { rows: ComparedProduct[]; products: Product[]; userId: string; role: UserRole; onAddLot: (row: ComparedProduct) => void; notify: (message: string, error?: boolean) => void }) {
  const [editing, setEditing] = useState<InlineEdit>()
  const [noteDrafts, setNoteDrafts] = useState<Record<string,string>>({})
  const [openAdminNotes, setOpenAdminNotes] = useState<Record<string,boolean>>({})
  const [busy, setBusy] = useState(false)
  const [noteBusy, setNoteBusy] = useState<string>()
  const canManageData = role === 'admin'
  const canEditSaleNote = role === 'admin' || role === 'sale'

  async function persist(row: ComparedProduct, lots: Lot[], isNewDate: boolean, force = false) {
    if (!row.current || !canManageData) return
    const product = products.find((item)=>item.id===row.productId)
    const normalizedLots = product ? lots.map((lot)=>{const quantity=lotQuantityInPacks(lot,product);return quantity===null?lot:{...lot,quantity,unit:'gói',quantityBreakdown:quantityBreakdownFromLot(lot)}}) : lots
    const errors = validateLots(normalizedLots, ['gói'])
    if (errors.length) return notify(errors[0], true)
    setBusy(true)
    try {
      await saveDateRecord({ record: recordInput(row.current,userId,{lots:normalizedLots,isNewDate}), expectedUpdatedAt: row.current.updatedAt?.toDate?.().toISOString(), force })
      setEditing(undefined)
      notify('Đã cập nhật trực tiếp trên bảng.')
    } catch (error) {
      if (!force && error instanceof Error && error.message === 'CONFLICT' && confirm('Bản ghi vừa được người khác thay đổi. Bạn vẫn muốn ghi đè?')) await persist(row, lots, isNewDate, true)
      else notify('Không thể cập nhật dữ liệu.', true)
    } finally { setBusy(false) }
  }

  async function saveInline(row: ComparedProduct) {
    if (!editing || !row.current) return
    await persist(row, row.current.lots.map((lot)=>lot.lotId===editing.lot.lotId?editing.lot:lot), editing.isNewDate)
  }

  async function saveSaleNote(row: ComparedProduct, force = false) {
    if (!row.current || !canEditSaleNote) return
    const saleNote = noteDrafts[row.key] ?? row.current.saleNote ?? ''
    setNoteBusy(row.key)
    try {
      await saveDateRecord({ record: recordInput(row.current,userId,{saleNote}), expectedUpdatedAt: row.current.updatedAt?.toDate?.().toISOString(), force })
      setNoteDrafts((current)=>{const next={...current};delete next[row.key];return next})
      notify('Đã lưu ghi chú Sale cho mã sản phẩm.')
    } catch (error) {
      if (!force && role==='admin' && error instanceof Error && error.message === 'CONFLICT' && confirm('Ghi chú vừa được người khác thay đổi. Bạn vẫn muốn ghi đè?')) await saveSaleNote(row,true)
      else if (error instanceof Error && error.message === 'CONFLICT') notify('Dữ liệu vừa thay đổi. Hãy tải lại trang rồi nhập lại ghi chú.', true)
      else notify('Không thể lưu ghi chú Sale.', true)
    } finally { setNoteBusy(undefined) }
  }

  async function removeCode(row: ComparedProduct) {
    if (!canManageData || !row.current || !confirm(`Xóa toàn bộ mã ${row.productCode} khỏi ngày ${formatDate(row.current.chatDate)}?`)) return
    try { await deleteDateRecord(row.current.id); if (editing?.rowKey===row.key) setEditing(undefined); notify(`Đã xóa mã ${row.productCode} khỏi ngày đang chọn.`) }
    catch { notify('Không thể xóa mã.', true) }
  }

  async function removeLot(row: ComparedProduct, lot: Lot) {
    if (!canManageData || !row.current) return
    if (row.current.lots.length===1) {
      if (!confirm('Đây là lô cuối cùng. Xóa lô này sẽ xóa luôn mã sản phẩm khỏi ngày đang chọn. Tiếp tục?')) return
      try { await deleteDateRecord(row.current.id); setEditing(undefined); notify(`Đã xóa lô cuối và mã ${row.productCode}.`) }
      catch { notify('Không thể xóa lô.', true) }
      return
    }
    if (!confirm(`Xóa lô NSX ${formatDate(lot.productionDate)} khỏi mã ${row.productCode}?`)) return
    await persist(row, row.current.lots.filter((item)=>item.lotId!==lot.lotId), row.current.isNewDate)
  }

  if (!rows.length) return <div className="grid min-h-72 place-items-center p-10 text-center"><div><SearchX className="mx-auto text-slate-300" size={42}/><h3 className="mt-3 font-bold">Không có dữ liệu phù hợp</h3><p className="mt-1 text-sm text-slate-500">Thử đổi ngày, bộ lọc hoặc thêm dữ liệu mới.</p></div></div>

  return <div className="max-h-[58vh] overflow-auto"><table className="comparison-table"><thead><tr><th className="sticky-col-1 w-36">Mã sản phẩm</th><th className="sticky-col-2 min-w-60">Tên sản phẩm (Tên tiếng Việt)</th><th className="min-w-64">Ghi chú Sale</th><th>NSX</th><th>Số lượng (gói)</th><th>% date</th><th>Có mới?</th>{canManageData&&<th>Thao tác</th>}</tr></thead><tbody>{rows.map((row,rowIndex)=>{
    const lots=row.lots.filter((item)=>item.current)
    const product=products.find((item)=>item.id===row.productId)
    const saleNote=noteDrafts[row.key]??row.current?.saleNote??''
    const noteOpen=role!=='admin'||Boolean(openAdminNotes[row.key])
    return lots.map((comparedLot,index)=>{
      const lot=comparedLot.current!
      const isEditing=editing?.rowKey===row.key&&editing.lot.lotId===lot.lotId
      return <tr key={`${row.key}-${comparedLot.key}`} className={rowIndex%2===1?'comparison-row-alt':'comparison-row-base'}>
        {index===0&&<><td rowSpan={lots.length} className="sticky-col-1 font-bold text-brand-700">{row.productCode}</td><td rowSpan={lots.length} className="sticky-col-2"><div className="min-w-60"><p className="font-semibold text-slate-900">{row.productName||'Chưa bổ sung tên sản phẩm'}</p><p className="mt-0.5 text-sm text-slate-600">{row.vietnameseName||'Chưa bổ sung tên tiếng Việt'}</p>{product&&<p className="mt-1.5 text-xs font-medium leading-relaxed text-brand-700">Quy cách: {packagingSummary(product)}</p>}</div></td><td rowSpan={lots.length} className="align-top"><div className="min-w-60">{role==='admin'&&<button className="btn-secondary h-8 border-violet-200 text-violet-700" type="button" aria-expanded={noteOpen} onClick={()=>setOpenAdminNotes((current)=>({...current,[row.key]:!noteOpen}))}><ChevronDown className={`transition-transform ${noteOpen?'rotate-180':''}`} size={14}/>{noteOpen?'Đóng ghi chú':'Mở ghi chú Sale'}</button>}{canEditSaleNote&&noteOpen?<><textarea className={`${role==='admin'?'mt-2 ':''}min-h-20 w-full resize-y rounded-lg border bg-white p-2 text-sm shadow-sm focus:border-violet-500`} value={saleNote} onChange={(event)=>setNoteDrafts({...noteDrafts,[row.key]:event.target.value})} placeholder="Sale ghi chú tình trạng hoặc hướng xử lý cho cả mã…"/><button className="btn-secondary mt-2 h-8 border-violet-200 text-violet-700" disabled={noteBusy===row.key} onClick={()=>void saveSaleNote(row)}><Save size={14}/>{noteBusy===row.key?'Đang lưu…':'Lưu ghi chú'}</button></>:<p className={`${role==='admin'?'mt-2 line-clamp-2 ':''}whitespace-pre-wrap text-sm text-slate-600`}>{saleNote.trim()||'Chưa có ghi chú.'}</p>}</div></td></>}
        <td>{isEditing?<input className="input min-w-36" type="date" value={editing.lot.productionDate} onChange={(event)=>setEditing({...editing,lot:{...editing.lot,productionDate:event.target.value}})}/>:formatDate(lot.productionDate)}</td>
        <td className="number-cell">{isEditing?<input className="input w-28" type="number" min="0" step="any" value={editing.lot.quantity} onChange={(event)=>{const quantity=Number(event.target.value);setEditing({...editing,lot:{...editing.lot,quantity,unit:'gói',quantityBreakdown:{packs:quantity}}})}}/>:product?(lotQuantityInPacks(lot,product)??'—'):lot.unit==='gói'?lot.quantity:'—'}</td>
        <td className="number-cell">{isEditing?<input className="input w-24" type="number" min="0" max="100" step="any" value={editing.lot.datePercent} onChange={(event)=>setEditing({...editing,lot:{...editing.lot,datePercent:Number(event.target.value)}})}/>:`${lot.datePercent}%`}</td>
        <td>{isEditing?<select className="input min-w-28" value={editing.isNewDate?'new':'normal'} onChange={(event)=>setEditing({...editing,isNewDate:event.target.value==='new'})}><option value="new">CÓ MỚI</option><option value="normal">KHÔNG</option></select>:<span className={row.current?.isNewDate?'badge badge-blue':'badge'}>{row.current?.isNewDate?'CÓ MỚI':'KHÔNG'}</span>}</td>
        {canManageData&&<td><div className="flex min-w-40 items-center gap-1">{isEditing?<><button className="icon-btn text-emerald-700" disabled={busy} onClick={()=>void saveInline(row)} title="Lưu thay đổi"><Check size={16}/></button><button className="icon-btn" disabled={busy} onClick={()=>setEditing(undefined)} title="Hủy sửa"><X size={16}/></button></>:<>{index===0&&<button className="icon-btn text-brand-700" onClick={()=>onAddLot(row)} title="Thêm lô mới cho mã này"><Plus size={16}/></button>}<button className="icon-btn" onClick={()=>{const quantity=product?(lotQuantityInPacks(lot,product)??lot.quantity):lot.quantity;setEditing({rowKey:row.key,lot:{...lot,quantity,unit:'gói',quantityBreakdown:{packs:quantity}},isNewDate:row.current?.isNewDate??false})}} title="Sửa trực tiếp"><Pencil size={16}/></button><button className="icon-btn text-rose-600" onClick={()=>void removeLot(row,lot)} title="Xóa lô"><Trash2 size={16}/></button>{index===0&&<button className="icon-btn text-rose-700" onClick={()=>void removeCode(row)} title="Xóa toàn bộ mã khỏi ngày đang chọn"><PackageX size={16}/></button>}</>}</div></td>}
      </tr>
    })
  })}</tbody></table></div>
}
