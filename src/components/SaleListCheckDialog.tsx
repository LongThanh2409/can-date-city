import { useDeferredValue, useMemo, useState } from 'react'
import { ClipboardList, Copy, X } from 'lucide-react'
import { checkSaleList, saleListLotText, saleListMessage, saleListStatusText } from '../domain/saleListCheck'
import { formatDate } from '../lib/date'
import type { DateRecord, Product } from '../types'

/** Admin checks Sale's "đi date mới" list against the near-date table of the selected day. Read-only. */
export function SaleListCheckDialog({ records, products, chatDate, onClose, notify }: { records: DateRecord[]; products: Product[]; chatDate: string; onClose: () => void; notify: (message: string, error?: boolean) => void }) {
  const [text,setText]=useState('')
  const deferredText=useDeferredValue(text)
  const result=useMemo(()=>checkSaleList(deferredText,records,products),[deferredText,records,products])
  const hasResult=result.pastedCount>0

  const copy=async()=>{
    try { await navigator.clipboard.writeText(saleListMessage(result,chatDate)); notify('Đã sao chép, dán vào tin nhắn gửi Sale.') }
    catch { notify('Không thể sao chép. Hãy bôi đen kết quả và copy thủ công.',true) }
  }

  return <div className="fixed inset-0 z-[65] bg-slate-950/50 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-labelledby="sale-list-title" onKeyDown={(event)=>{if(event.key==='Escape')onClose()}}>
    <section className="mx-auto flex h-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b px-5 py-4">
        <div><h2 id="sale-list-title" className="flex items-center gap-2 text-lg font-bold"><ClipboardList className="text-brand-600" size={19}/>Đối chiếu danh sách Sale</h2><p className="mt-0.5 text-xs text-slate-500">Dán cột mã từ Excel để xem mã nào đang có trong bảng cận date ngày {formatDate(chatDate)}. Chỉ xem, không sửa dữ liệu.</p></div>
        <button className="icon-btn" onClick={onClose} aria-label="Đóng"><X size={18}/></button>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4 sm:p-5">
        <div>
          <label className="label" htmlFor="sale-list-input">Danh sách mã của Sale</label>
          <textarea id="sale-list-input" autoFocus className="input h-auto min-h-28 resize-y py-2 font-mono text-sm" placeholder={'Dán cột mã từ Excel, mỗi dòng một mã…\nSP001\nSP002'} value={text} onChange={(event)=>setText(event.target.value)}/>
        </div>
        {hasResult&&<>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-600">Dán <strong>{result.pastedCount}</strong> mã · <strong className="text-brand-700">{result.nearDate.length}</strong> mã có cận date · <strong>{result.notNearDate.length}</strong> mã không có</p>
            <button className="btn-primary" onClick={()=>void copy()}><Copy size={16}/>Sao chép gửi Sale</button>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-bold text-slate-900">Mã đang có cận date ({result.nearDate.length})</h3>
            {result.nearDate.length?<div className="overflow-x-auto rounded-xl border"><table className="data-table min-w-[640px]"><thead><tr><th>Mã</th><th>Tên</th><th>Số lượng</th><th>Trạng thái</th></tr></thead><tbody>{result.nearDate.map((item)=><tr key={item.code} className={item.isNewDate?'':'bg-amber-50'}>
              <td className="whitespace-nowrap font-bold text-brand-700">{item.code}</td>
              <td><p className="font-semibold leading-snug">{item.vietnameseName||item.productName||'—'}</p>{item.vietnameseName&&item.productName&&<p className="text-xs text-slate-500">{item.productName}</p>}</td>
              <td className="whitespace-nowrap">{item.lots.map((lot,index)=><p key={index}>{saleListLotText(lot)}</p>)}</td>
              <td className="whitespace-nowrap"><span className={`rounded px-2 py-1 text-xs font-bold ${item.isNewDate?'bg-emerald-100 text-emerald-800':'bg-amber-200 text-amber-900'}`}>{saleListStatusText(item.isNewDate)}</span></td>
            </tr>)}</tbody></table></div>:<p className="rounded-xl border border-dashed p-4 text-sm text-slate-500">Không có mã nào trong danh sách đang cận date.</p>}
          </div>

          {result.notNearDate.length>0&&<div>
            <h3 className="mb-2 text-sm font-bold text-slate-900">Mã không có cận date ({result.notNearDate.length})</h3>
            <ul className="divide-y rounded-xl border text-sm">{result.notNearDate.map((item)=><li key={item.code} className="flex flex-wrap items-baseline gap-x-3 px-3 py-2"><span className="font-bold text-slate-700">{item.code}</span>{item.inCatalog?<span className="text-slate-600">{item.vietnameseName||item.productName}</span>:<span className="text-xs text-rose-600">Không có trong danh mục sản phẩm, kiểm tra lại mã</span>}</li>)}</ul>
          </div>}
        </>}
      </div>
    </section>
  </div>
}
