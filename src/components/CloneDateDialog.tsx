import { Copy, Loader2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatDate } from '../lib/date'
import { cloneChatDate } from '../services/firestore'

interface Props {
  availableDates: string[]
  defaultSourceDate: string
  defaultTargetDate: string
  userId: string
  onClose: () => void
  onCompleted: (targetDate: string, message: string) => void
}

export function CloneDateDialog({ availableDates, defaultSourceDate, defaultTargetDate, userId, onClose, onCompleted }: Props) {
  const [sourceDate, setSourceDate] = useState(availableDates.includes(defaultSourceDate) ? defaultSourceDate : availableDates[0] ?? '')
  const [targetDate, setTargetDate] = useState(defaultTargetDate)
  const [copySaleNotes, setCopySaleNotes] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!sourceDate || !targetDate) return setError('Vui lòng chọn đủ ngày nguồn và ngày đích.')
    if (sourceDate === targetDate) return setError('Ngày nguồn và ngày đích phải khác nhau.')
    setBusy(true)
    setError('')
    try {
      const result = await cloneChatDate(sourceDate, targetDate, userId, copySaleNotes)
      const skipped = result.skipped ? ` Bỏ qua ${result.skipped} mã đã có ở ngày đích.` : ''
      onCompleted(targetDate, `Đã sao chép ${result.copied} mã từ ${formatDate(sourceDate)}.${skipped}`)
    } catch {
      setError('Không thể sao chép dữ liệu. Vui lòng kiểm tra kết nối và thử lại.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="fixed inset-0 z-[65] grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="clone-date-title">
    <form className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl" onSubmit={submit}>
      <header className="flex items-center justify-between border-b px-5 py-4">
        <div><h2 id="clone-date-title" className="text-lg font-bold">Tạo ngày mới từ dữ liệu cũ</h2><p className="mt-0.5 text-xs text-slate-500">Các mã đã tồn tại ở ngày đích sẽ được giữ nguyên.</p></div>
        <button type="button" className="icon-btn" onClick={onClose} disabled={busy} aria-label="Đóng"><X size={18}/></button>
      </header>
      <div className="space-y-4 p-5">
        <div><label className="label" htmlFor="clone-source-date">Ngày nguồn</label><select id="clone-source-date" className="input" value={sourceDate} onChange={(event)=>setSourceDate(event.target.value)} autoFocus>{availableDates.map((date)=><option value={date} key={date}>{formatDate(date)}</option>)}</select></div>
        <div><label className="label" htmlFor="clone-target-date">Ngày đích</label><input id="clone-target-date" className="input" type="date" value={targetDate} onChange={(event)=>setTargetDate(event.target.value)}/></div>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-slate-50 p-3 text-sm"><input className="mt-0.5 h-4 w-4" type="checkbox" checked={copySaleNotes} onChange={(event)=>setCopySaleNotes(event.target.checked)}/><span><strong className="block">Sao chép ghi chú Sale</strong><span className="text-xs text-slate-500">Mặc định ghi chú và trạng thái xử lý Sale được làm mới cho ngày đích.</span></span></label>
        {error&&<p className="notice notice-error" role="alert">{error}</p>}
      </div>
      <footer className="flex justify-end gap-2 border-t bg-slate-50 px-5 py-4"><button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Hủy</button><button type="submit" className="btn-primary" disabled={busy||!availableDates.length}>{busy?<Loader2 className="animate-spin" size={16}/>:<Copy size={16}/>} {busy?'Đang sao chép…':'Sao chép dữ liệu'}</button></footer>
    </form>
  </div>
}
