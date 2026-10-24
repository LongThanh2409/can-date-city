import { Check, ChevronDown, GripVertical, PackageX, Pencil, Plus, Save, SearchX, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { validateLots } from '../domain/validation'
import { lotQuantityInPacks, packagingSummary, quantityBreakdownFromLot } from '../domain/product'
import { formatDate } from '../lib/date'
import { deleteDateRecord, saveDateRecord, updateSaleNote } from '../services/firestore'
import type { ComparedProduct, DateRecord, Lot, Product, UserRole } from '../types'

type InlineEdit = { rowKey: string; lot: Lot; isNewDate: boolean }
type NoteSaveState = 'dirty' | 'saving' | 'saved' | 'error'
type NoteStatus = { state: NoteSaveState; savedAt?: Date }

const noteDraftStorageKey = (recordId: string) => `chat-can-date:sale-note-draft:${recordId}`
const noteKey = (row: ComparedProduct) => row.current?.id ?? row.key

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
    priorityOrder: source.priorityOrder,
    saleNote: changes.saleNote ?? source.saleNote ?? '',
    saleWorkflow: source.saleWorkflow,
  }
}

export function ComparisonTable({ rows, products, userId, role, reorderEnabled = false, reorderBusy = false, onReorder, onAddLot, notify }: { rows: ComparedProduct[]; products: Product[]; userId: string; role: UserRole; reorderEnabled?: boolean; reorderBusy?: boolean; onReorder?: (sourceId: string, targetId: string) => void; onAddLot: (row: ComparedProduct) => void; notify: (message: string, error?: boolean) => void }) {
  const [editing, setEditing] = useState<InlineEdit>()
  const [noteDrafts, setNoteDrafts] = useState<Record<string,string>>({})
  const [noteStatuses, setNoteStatuses] = useState<Record<string,NoteStatus>>({})
  const [openAdminNotes, setOpenAdminNotes] = useState<Record<string,boolean>>({})
  const [busy, setBusy] = useState(false)
  const [draggedRecordId, setDraggedRecordId] = useState<string>()
  const [dragOverRecordId, setDragOverRecordId] = useState<string>()
  const noteDraftsRef = useRef<Record<string,string>>({})
  const noteTimersRef = useRef<Record<string,ReturnType<typeof setTimeout>>>({})
  const savingNotesRef = useRef(new Set<string>())
  const pendingNotesRef = useRef<Record<string,{ row: ComparedProduct; note: string; manual: boolean }>>({})
  const saveSaleNoteRef = useRef<((row: ComparedProduct, saleNote?: string, manual?: boolean) => Promise<void>) | undefined>(undefined)
  const canManageData = role === 'admin'
  const canEditSaleNote = role === 'admin' || role === 'sale'

  useEffect(() => {
    if (!canEditSaleNote) return
    const restored: Record<string,string> = {}
    rows.forEach((row) => {
      if (!row.current || noteDraftsRef.current[noteKey(row)] !== undefined) return
      try {
        const draft = localStorage.getItem(noteDraftStorageKey(row.current.id))
        if (draft !== null && draft !== (row.current.saleNote ?? '')) restored[noteKey(row)] = draft
        else if (draft !== null) localStorage.removeItem(noteDraftStorageKey(row.current.id))
      } catch { /* Trình duyệt có thể chặn localStorage; tự động lưu Firestore vẫn hoạt động. */ }
    })
    if (!Object.keys(restored).length) return
    Object.assign(noteDraftsRef.current, restored)
    setNoteDrafts((current)=>({...current,...restored}))
    setNoteStatuses((current)=>{
      const next={...current}; Object.keys(restored).forEach((key)=>{next[key]={state:'dirty'}}); return next
    })
    Object.entries(restored).forEach(([key,note])=>{
      const row = rows.find((item)=>noteKey(item)===key)
      if (row) noteTimersRef.current[key] = setTimeout(()=>void saveSaleNoteRef.current?.(row,note),2000)
    })
  }, [canEditSaleNote, rows])

  useEffect(() => {
    const hasUnsavedNote = Object.values(noteStatuses).some((status)=>status.state==='dirty'||status.state==='saving'||status.state==='error')
    if (!hasUnsavedNote) return
    const warnBeforeLeave = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warnBeforeLeave)
    return () => window.removeEventListener('beforeunload', warnBeforeLeave)
  }, [noteStatuses])

  useEffect(() => {
    const confirmedKeys = rows.flatMap((row)=>row.current && noteStatuses[noteKey(row)]?.state==='saved' && noteDraftsRef.current[noteKey(row)] === (row.current.saleNote ?? '') ? [noteKey(row)] : [])
    if (!confirmedKeys.length) return
    confirmedKeys.forEach((key)=>{delete noteDraftsRef.current[key]})
    setNoteDrafts((current)=>{
      const next={...current}; confirmedKeys.forEach((key)=>{delete next[key]}); return next
    })
  }, [noteStatuses, rows])

  useEffect(() => () => { Object.values(noteTimersRef.current).forEach(clearTimeout) }, [])

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

  async function saveSaleNote(row: ComparedProduct, saleNote = noteDraftsRef.current[noteKey(row)] ?? row.current?.saleNote ?? '', manual = false) {
    if (!row.current || !canEditSaleNote) return
    const key = noteKey(row)
    clearTimeout(noteTimersRef.current[key])
    delete noteTimersRef.current[key]
    if (savingNotesRef.current.has(key)) {
      pendingNotesRef.current[key] = { row, note:saleNote, manual }
      return
    }
    savingNotesRef.current.add(key)
    setNoteStatuses((current)=>({...current,[key]:{state:'saving'}}))
    try {
      await updateSaleNote(row.current.id,saleNote,userId)
      const latestDraft = noteDraftsRef.current[key]
      if (latestDraft === saleNote) {
        clearTimeout(noteTimersRef.current[key])
        delete noteTimersRef.current[key]
        try { localStorage.removeItem(noteDraftStorageKey(row.current.id)) } catch { /* Không ảnh hưởng dữ liệu đã lưu. */ }
      }
      setNoteStatuses((current)=>({...current,[key]:latestDraft===saleNote?{state:'saved',savedAt:new Date()}:{state:'dirty'}}))
      if (manual) notify('Đã lưu ghi chú Sale cho mã sản phẩm.')
    } catch {
      setNoteStatuses((current)=>({...current,[key]:{state:'error'}}))
      if (manual) notify('Không thể lưu ghi chú Sale. Bản nháp vẫn được giữ trên thiết bị.', true)
    } finally {
      savingNotesRef.current.delete(key)
      const pending = pendingNotesRef.current[key]
      delete pendingNotesRef.current[key]
      if (pending && pending.note !== saleNote) void saveSaleNote(pending.row,pending.note,pending.manual)
    }
  }
  useEffect(() => { saveSaleNoteRef.current = saveSaleNote })

  function changeSaleNote(row: ComparedProduct, saleNote: string) {
    if (!row.current) return
    const key = noteKey(row)
    if (!savingNotesRef.current.has(key) && saleNote === (row.current.saleNote ?? '')) {
      clearTimeout(noteTimersRef.current[key])
      delete noteTimersRef.current[key]
      delete noteDraftsRef.current[key]
      setNoteDrafts((current)=>{const next={...current};delete next[key];return next})
      setNoteStatuses((current)=>({...current,[key]:{state:'saved'}}))
      try { localStorage.removeItem(noteDraftStorageKey(row.current!.id)) } catch { /* Không còn bản nháp cần giữ. */ }
      return
    }
    noteDraftsRef.current[key] = saleNote
    setNoteDrafts((current)=>({...current,[key]:saleNote}))
    setNoteStatuses((current)=>({...current,[key]:{state:'dirty'}}))
    try { localStorage.setItem(noteDraftStorageKey(row.current.id),saleNote) } catch { /* Firestore vẫn là nơi lưu chính. */ }
    clearTimeout(noteTimersRef.current[key])
    noteTimersRef.current[key] = setTimeout(()=>void saveSaleNote(row,saleNote),2000)
  }

  function saveNoteOnBlur(row: ComparedProduct) {
    const key = noteKey(row)
    const draft = noteDraftsRef.current[key]
    if (draft !== undefined && noteStatuses[key]?.state !== 'saved') void saveSaleNote(row,draft)
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

  const saleCards = role==='sale'&&<div className="space-y-3 p-3 md:hidden">{rows.map((row)=>{
    if (!row.current) return null
    const product=products.find((item)=>item.id===row.productId)
    const saleNote=noteDrafts[noteKey(row)]??row.current.saleNote??''
    const noteStatus=noteStatuses[noteKey(row)]
    return <article key={row.key} className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3"><div><strong className="text-base text-brand-700">{row.productCode}</strong><p className="font-semibold text-slate-900">{row.vietnameseName||row.productName||'Chưa bổ sung tên'}</p>{product&&<p className="mt-1 text-xs text-slate-500">{packagingSummary(product)}</p>}</div><span className={row.current.isNewDate?'badge badge-blue':'badge'}>{row.current.isNewDate?'CÓ MỚI':'KHÔNG MỚI'}</span></div>
      <div className="mt-3 space-y-2">{row.current.lots.map((lot,index)=><div key={lot.lotId} className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-3 text-xs"><span><span className="block text-slate-400">Lô {index+1} · NSX</span><strong>{formatDate(lot.productionDate)}</strong></span><span><span className="block text-slate-400">Số lượng</span><strong>{product?(lotQuantityInPacks(lot,product)??'—'):lot.quantity} gói</strong></span><span><span className="block text-slate-400">% date</span><strong className={lot.datePercent<=30?'text-rose-700':''}>{lot.datePercent}%</strong></span></div>)}</div>
      <textarea className="mt-3 min-h-24 w-full resize-y rounded-lg border bg-white p-3 text-sm font-semibold shadow-sm focus:border-violet-500" value={saleNote} onChange={(event)=>changeSaleNote(row,event.target.value)} onBlur={()=>saveNoteOnBlur(row)} placeholder="Ghi chú tình trạng hoặc hướng xử lý…"/>
      <div className="mt-2 flex items-center justify-between gap-2"><p className={`text-xs ${noteStatus?.state==='error'?'font-bold text-rose-700':noteStatus?.state==='saved'?'font-bold text-emerald-700':'text-slate-500'}`}>{noteStatus?.state==='saving'?'Đang lưu…':noteStatus?.state==='dirty'?'Tự lưu sau 2 giây':noteStatus?.state==='error'?'Lưu lỗi · bản nháp vẫn an toàn':noteStatus?.state==='saved'?'Đã lưu':'Tự động lưu khi ngừng nhập'}</p><button className="btn-secondary h-9" disabled={!noteStatus||noteStatus.state==='saving'||noteStatus.state==='saved'} onMouseDown={(event)=>event.preventDefault()} onClick={()=>void saveSaleNote(row,saleNote,true)}><Save size={14}/>{noteStatus?.state==='error'?'Thử lại':'Lưu ngay'}</button></div>
    </article>
  })}</div>

  return <>{saleCards}<div className={`max-h-[58vh] overflow-auto ${role==='sale'?'hidden md:block':''}`}><table className="comparison-table"><thead><tr><th className="sticky-col-1 w-28 min-w-28 max-w-28">Mã sản phẩm</th><th className="sticky-col-2 w-44 min-w-44 max-w-44">Tên sản phẩm (Tên tiếng Việt)</th><th className="w-36 min-w-36">Có mới?</th><th className="w-36 min-w-36">NSX</th><th className="w-36 min-w-36">Số lượng (gói)</th><th className="w-24 min-w-24">% date</th>{canManageData&&<th className="w-44 min-w-44">Thao tác</th>}<th className="w-[26rem] min-w-[26rem] max-w-[26rem]">Ghi chú Sale</th></tr></thead><tbody>{rows.map((row,rowIndex)=>{
    const lots=role==='sale'?row.lots.filter((item)=>item.current):row.lots
    const product=products.find((item)=>item.id===row.productId)
    const saleNote=noteDrafts[noteKey(row)]??row.current?.saleNote??row.previous?.saleNote??''
    const noteStatus=noteStatuses[noteKey(row)]
    const noteOpen=role!=='admin'||Boolean(openAdminNotes[row.key])
    const isEditingProduct=editing?.rowKey===row.key
    return lots.map((comparedLot,index)=>{
      const lot=comparedLot.current??comparedLot.previous!
      const isEditing=Boolean(comparedLot.current)&&editing?.rowKey===row.key&&editing.lot.lotId===lot.lotId
      return <tr key={`${row.key}-${comparedLot.key}`} onDragOver={(event)=>{if(reorderEnabled&&row.current&&draggedRecordId&&draggedRecordId!==row.current.id){event.preventDefault();setDragOverRecordId(row.current.id)}}} onDragLeave={()=>{if(dragOverRecordId===row.current?.id)setDragOverRecordId(undefined)}} onDrop={(event)=>{event.preventDefault();const targetId=row.current?.id;if(reorderEnabled&&draggedRecordId&&targetId&&draggedRecordId!==targetId)onReorder?.(draggedRecordId,targetId);setDraggedRecordId(undefined);setDragOverRecordId(undefined)}} className={`${rowIndex%2===1?'comparison-row-alt':'comparison-row-base'} ${dragOverRecordId===row.current?.id?'outline outline-2 outline-offset-[-2px] outline-brand-500':''} ${!row.current?'bg-amber-50/70':''}`}>
        {index===0&&<><td rowSpan={lots.length} draggable={reorderEnabled&&Boolean(row.current)&&!reorderBusy} onDragStart={(event)=>{if(!row.current)return;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',row.current.id);setDraggedRecordId(row.current.id)}} onDragEnd={()=>{setDraggedRecordId(undefined);setDragOverRecordId(undefined)}} className={`sticky-col-1 max-w-28 break-all font-bold leading-tight text-brand-700 ${reorderEnabled&&row.current?'cursor-grab active:cursor-grabbing':''}`}><div className="flex items-start gap-1">{reorderEnabled&&row.current&&<GripVertical className="mt-0.5 shrink-0 text-slate-400" size={16}/>}<span>{row.productCode}</span></div>{!row.current&&<span className="mt-2 block rounded bg-amber-200 px-1.5 py-1 text-[10px] font-bold leading-tight text-amber-900">HÔM QUA CÓ · HÔM NAY KHÔNG</span>}</td><td rowSpan={lots.length} className="sticky-col-2"><div className="w-44 max-w-44 break-words"><p className="font-semibold leading-snug text-slate-900">{row.productName||'Chưa bổ sung tên sản phẩm'}</p><p className="mt-0.5 text-sm leading-snug text-slate-600">{row.vietnameseName||'Chưa bổ sung tên tiếng Việt'}</p>{product&&<p className="mt-1.5 text-xs font-medium leading-relaxed text-brand-700">Quy cách: {packagingSummary(product)}</p>}</div></td><td rowSpan={lots.length}><div className="space-y-2">{row.current&&<div><p className="mb-1 text-[10px] font-semibold text-slate-400">{formatDate(row.current.chatDate)}</p>{isEditingProduct&&editing?<select className="input min-w-36" value={editing.isNewDate?'new':'normal'} onChange={(event)=>setEditing({...editing,isNewDate:event.target.value==='new'})}><option value="new">CÓ MỚI</option><option value="normal">KHÔNG CÓ MỚI</option></select>:<span className={row.current.isNewDate?'badge badge-blue':'badge'}>{row.current.isNewDate?'CÓ MỚI':'KHÔNG CÓ MỚI'}</span>}</div>}{role!=='sale'&&row.previous&&<div><p className="mb-1 text-[10px] font-semibold text-slate-400">{formatDate(row.previous.chatDate)}</p><span className={row.previous.isNewDate?'badge badge-blue':'badge'}>{row.previous.isNewDate?'CÓ MỚI':'KHÔNG CÓ MỚI'}</span></div>}</div></td></>}
        <td className="whitespace-nowrap">{isEditing?<input className="input min-w-32" type="date" value={editing!.lot.productionDate} onChange={(event)=>setEditing({...editing!,lot:{...editing!.lot,productionDate:event.target.value}})}/>:formatDate(lot.productionDate)}</td>
        <td className="number-cell whitespace-nowrap">{isEditing?<input className="input w-28" type="number" min="0" step="any" value={editing!.lot.quantity} onChange={(event)=>{const quantity=Number(event.target.value);setEditing({...editing!,lot:{...editing!.lot,quantity,unit:'gói',quantityBreakdown:{packs:quantity}}})}}/>:<>{product?(lotQuantityInPacks(lot,product)??'—'):lot.unit==='gói'?lot.quantity:'—'}{!comparedLot.current&&<span className="ml-1 text-[10px] font-normal text-slate-400">(ngày trước)</span>}</>}</td>
        <td className="number-cell whitespace-nowrap">{isEditing?<input className="input w-20" type="number" min="0" max="100" step="any" value={editing!.lot.datePercent} onChange={(event)=>setEditing({...editing!,lot:{...editing!.lot,datePercent:Number(event.target.value)}})}/>:<>{lot.datePercent}%{!comparedLot.current&&<span className="ml-1 text-[10px] font-normal text-slate-400">(ngày trước)</span>}</>}</td>
        {canManageData&&<td>{comparedLot.current?<div className="flex min-w-40 items-center gap-1.5">{isEditing?<><button className="icon-btn text-emerald-700" disabled={busy} onClick={()=>void saveInline(row)} title="Lưu thay đổi" aria-label="Lưu thay đổi"><Check size={16}/></button><button className="icon-btn" disabled={busy} onClick={()=>setEditing(undefined)} title="Hủy sửa" aria-label="Hủy sửa"><X size={16}/></button></>:<>{index===0&&<button className="icon-btn text-brand-700" onClick={()=>onAddLot(row)} title="Thêm lô mới cho mã này" aria-label="Thêm lô mới"><Plus size={16}/></button>}<button className="icon-btn" onClick={()=>{const quantity=product?(lotQuantityInPacks(lot,product)??lot.quantity):lot.quantity;setEditing({rowKey:row.key,lot:{...lot,quantity,unit:'gói',quantityBreakdown:{packs:quantity}},isNewDate:row.current?.isNewDate??false})}} title="Sửa trực tiếp" aria-label="Sửa lô"><Pencil size={16}/></button><button className="icon-btn text-rose-600" onClick={()=>void removeLot(row,lot)} title="Xóa lô" aria-label="Xóa lô"><Trash2 size={16}/></button>{index===0&&<button className="icon-btn text-rose-700" onClick={()=>void removeCode(row)} title="Xóa toàn bộ mã khỏi ngày đang chọn" aria-label="Xóa toàn bộ mã"><PackageX size={16}/></button>}</>}</div>:<span className="text-xs text-slate-400">Chỉ có ở ngày trước</span>}</td>}
        {index===0&&<td rowSpan={lots.length} className="w-[26rem] max-w-[26rem] align-top"><div className="w-96 max-w-96 overflow-hidden">{role==='admin'&&row.current&&<button className="btn-secondary h-8 border-violet-200 text-violet-700" type="button" aria-expanded={noteOpen} onClick={()=>setOpenAdminNotes((current)=>({...current,[row.key]:!noteOpen}))}><ChevronDown className={`transition-transform ${noteOpen?'rotate-180':''}`} size={14}/>{noteOpen?'Đóng ghi chú':'Mở ghi chú Sale'}</button>}{canEditSaleNote&&row.current&&noteOpen?<><textarea className={`${role==='admin'?'mt-2 ':''}min-h-20 w-full resize-y break-words rounded-lg border bg-white p-2 text-sm font-semibold text-slate-900 shadow-sm focus:border-violet-500`} value={saleNote} onChange={(event)=>changeSaleNote(row,event.target.value)} onBlur={()=>saveNoteOnBlur(row)} placeholder="Ghi chú Sale cho cả mã…"/><div className="mt-2 flex items-center justify-between gap-2"><p className={`text-xs font-medium ${noteStatus?.state==='error'?'text-rose-700':noteStatus?.state==='saved'?'text-emerald-700':'text-slate-500'}`}>{noteStatus?.state==='saving'?'Đang tự động lưu…':noteStatus?.state==='dirty'?'Chưa lưu · Tự lưu sau 2 giây':noteStatus?.state==='error'?'Lưu lỗi · Bản nháp vẫn an toàn':noteStatus?.state==='saved'?`Đã lưu${noteStatus.savedAt?` lúc ${noteStatus.savedAt.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}`:''}`:'Tự động lưu khi ngừng nhập'}</p><button className="btn-secondary h-8 shrink-0 border-violet-200 text-violet-700" disabled={!noteStatus||noteStatus.state==='saving'||noteStatus.state==='saved'} onMouseDown={(event)=>event.preventDefault()} onClick={()=>void saveSaleNote(row,saleNote,true)}><Save size={14}/>{noteStatus?.state==='error'?'Thử lại':noteStatus?.state==='saved'?'Đã lưu':'Lưu ngay'}</button></div></>:<p className={`${role==='admin'&&row.current?'mt-2 line-clamp-2 ':''}whitespace-pre-wrap break-words text-sm ${saleNote.trim()?'font-semibold text-slate-800':'text-slate-400'}`}>{saleNote.trim()||'Chưa có ghi chú.'}</p>}</div></td>}
      </tr>
    })
  })}</tbody></table></div></>
}
