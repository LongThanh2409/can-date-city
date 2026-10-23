import { History, Loader2, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { subscribeAuditLogs } from '../services/firestore'
import { formatDate } from '../lib/date'
import type { AuditLog } from '../types'

const ACTION_LABELS = { create:'Tạo mới',update:'Cập nhật',delete:'Xóa' } as const
const COLLECTION_LABELS = { dateRecords:'Dữ liệu cận date',products:'Sản phẩm',allowedUsers:'Tài khoản' } as const

export function AuditPanel({ onClose }: { onClose: () => void }) {
  const [logs,setLogs]=useState<AuditLog[]>([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState(false)
  const [query,setQuery]=useState('')
  useEffect(()=>subscribeAuditLogs((items)=>{setLogs(items);setLoading(false)},()=>{setError(true);setLoading(false)}),[])
  useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose()};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[onClose])
  const shown=useMemo(()=>{const term=query.trim().toLowerCase();return term?logs.filter((log)=>`${log.productCode} ${log.documentId} ${log.actorUid} ${log.changedFields.join(' ')}`.toLowerCase().includes(term)):logs},[logs,query])
  return <div className="fixed inset-0 z-[65] bg-slate-950/50 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-labelledby="audit-title"><section className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"><header className="flex items-center justify-between border-b px-5 py-4"><div><h2 id="audit-title" className="flex items-center gap-2 text-lg font-bold"><History className="text-brand-600" size={19}/>Lịch sử hoạt động</h2><p className="mt-0.5 text-xs text-slate-500">100 thay đổi gần nhất được ghi nhận bởi Firebase Functions.</p></div><button className="icon-btn" onClick={onClose} aria-label="Đóng"><X size={18}/></button></header><div className="border-b p-3"><div className="search-wrap"><Search/><input autoFocus aria-label="Tìm lịch sử" placeholder="Tìm mã sản phẩm, UID hoặc trường thay đổi…" value={query} onChange={(event)=>setQuery(event.target.value)}/></div></div><div className="min-h-0 flex-1 overflow-auto">{loading?<div className="flex items-center justify-center gap-2 py-16 text-slate-500"><Loader2 className="animate-spin" size={18}/>Đang tải lịch sử…</div>:error?<p className="notice notice-error m-4">Không thể tải lịch sử. Hãy chắc chắn Firebase Functions và Firestore Rules đã được deploy.</p>:<table className="data-table min-w-[760px]"><thead><tr><th>Thời gian</th><th>Đối tượng</th><th>Thao tác</th><th>Mã / tài liệu</th><th>Trường thay đổi</th><th>Người thực hiện</th></tr></thead><tbody>{shown.map((log)=><tr key={log.id}><td className="whitespace-nowrap">{log.occurredAt?.toDate().toLocaleString('vi-VN')??'Đang đồng bộ'}</td><td>{COLLECTION_LABELS[log.collection]??log.collection}</td><td><span className={`badge ${log.action==='create'?'badge-green':log.action==='delete'?'badge-orange':'badge-blue'}`}>{ACTION_LABELS[log.action]}</span></td><td><strong className="text-brand-700">{log.productCode||log.documentId}</strong>{log.chatDate&&<span className="block text-xs text-slate-400">{formatDate(log.chatDate)}</span>}</td><td className="max-w-xs text-xs text-slate-600">{log.changedFields.join(', ')||'—'}</td><td className="max-w-40 break-all text-xs text-slate-500">{log.actorUid}</td></tr>)}{!shown.length&&<tr><td colSpan={6} className="py-16 text-center text-slate-500">Chưa có hoạt động phù hợp.</td></tr>}</tbody></table>}</div></section></div>
}
