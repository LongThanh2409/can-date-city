import { ChevronLeft, ChevronRight, Download, ImagePlus, Images, Loader2, RefreshCw, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { formatDate, todayVietnam } from '../lib/date'
import { compressImage, isImageFile } from '../lib/imageCompress'
import { NM2_RETENTION_DAYS, deleteNm2Date, deleteNm2Image, enforceNm2Retention, subscribeNm2Days, subscribeNm2Images, uploadNm2Image } from '../services/nm2'
import type { Nm2Day, Nm2Image, UserRole } from '../types'

interface Props {
  role: UserRole
  userId: string
  notify: (message: string, error?: boolean) => void
}

export function Nm2Panel({ role, userId, notify }: Props) {
  const isAdmin = role === 'admin'
  const [days, setDays] = useState<Nm2Day[]>([])
  const [daysLoading, setDaysLoading] = useState(true)
  const [chatDate, setChatDate] = useState(isAdmin ? todayVietnam() : '')
  const [images, setImages] = useState<Nm2Image[]>([])
  const [imagesLoading, setImagesLoading] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number }>()
  const [dragOver, setDragOver] = useState(false)
  const [viewing, setViewing] = useState<number>()
  const fileInput = useRef<HTMLInputElement>(null)
  const retentionChecked = useRef('')

  useEffect(() => subscribeNm2Days((items) => { setDays(items); setDaysLoading(false) }, () => { setDaysLoading(false); notify('Không thể tải danh sách ngày NM2.', true) }), [notify])

  // Viewers have no date picker: follow the latest day with photos.
  useEffect(() => {
    if (isAdmin || !days.length || days.some((day) => day.chatDate === chatDate)) return
    setChatDate(days[0].chatDate)
  }, [isAdmin, days, chatDate])

  useEffect(() => {
    if (!chatDate) { setImages([]); return }
    setImagesLoading(true)
    setViewing(undefined)
    return subscribeNm2Images(chatDate, (items) => { setImages(items); setImagesLoading(false) }, () => { setImagesLoading(false); notify('Không thể tải ảnh NM2.', true) })
  }, [chatDate, notify])

  useEffect(() => {
    if (!isAdmin || days.length <= NM2_RETENTION_DAYS) return
    const signature = days.map((day) => day.chatDate).join('|')
    if (retentionChecked.current === signature) return
    retentionChecked.current = signature
    void enforceNm2Retention(days).catch(() => notify('Không thể dọn ảnh NM2 quá hạn.', true))
  }, [isAdmin, days, notify])

  const upload = useCallback(async (files: File[]) => {
    if (!isAdmin || progress) return
    const accepted = files.filter(isImageFile)
    if (!accepted.length) { notify('Không có tệp ảnh nào để tải lên.', true); return }
    if (!chatDate) { notify('Hãy chọn ngày trước.', true); return }
    setProgress({ done: 0, total: accepted.length })
    let failed = 0
    for (const [index, file] of accepted.entries()) {
      try {
        const compressed = await compressImage(file)
        await uploadNm2Image(chatDate, compressed, file.name || `anh-${index + 1}.jpg`, userId)
      } catch (error) {
        failed += 1
        notify(error instanceof Error && error.message ? `${file.name}: ${error.message}` : `Không tải được ${file.name}.`, true)
      }
      setProgress({ done: index + 1, total: accepted.length })
    }
    setProgress(undefined)
    const saved = accepted.length - failed
    if (saved) notify(`Đã tải ${saved} ảnh cho ngày ${formatDate(chatDate)}.`)
  }, [isAdmin, progress, chatDate, userId, notify])

  // Admins can paste screenshots or photos copied from chat apps straight into the page.
  useEffect(() => {
    if (!isAdmin) return
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable="true"]')) return
      const files = [...(event.clipboardData?.files ?? [])].filter(isImageFile)
      if (!files.length) return
      event.preventDefault()
      void upload(files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [isAdmin, upload])

  async function removeImage(image: Nm2Image) {
    if (!confirm('Xóa ảnh này?')) return
    try { await deleteNm2Image(image, images.length, userId); notify('Đã xóa ảnh.') }
    catch { notify('Xóa ảnh thất bại.', true) }
  }

  async function removeDay() {
    if (!confirm(`Xóa toàn bộ ${images.length} ảnh NM2 ngày ${formatDate(chatDate)}?`)) return
    try { const count = await deleteNm2Date(chatDate); notify(`Đã xóa ${count} ảnh ngày ${formatDate(chatDate)}.`) }
    catch { notify('Xóa ngày thất bại.', true) }
  }

  const busy = Boolean(progress)

  return <>
    <section className="rounded-xl border bg-white shadow-sm">
      <div className="flex flex-wrap items-end gap-3 p-4">
        {isAdmin && <div><label className="label" htmlFor="nm2-date">Ngày chát</label><input id="nm2-date" className="input w-44 font-semibold" type="date" value={chatDate} onChange={(event) => setChatDate(event.target.value)}/></div>}
        <div className="min-w-0 flex-1">
          <label className="label">{NM2_RETENTION_DAYS} ngày gần nhất có ảnh</label>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {days.slice(0, NM2_RETENTION_DAYS).map((day) => <button key={day.chatDate} className={`date-chip ${day.chatDate === chatDate ? 'date-chip-active' : ''}`} onClick={() => setChatDate(day.chatDate)}>{formatDate(day.chatDate)} · {day.imageCount}</button>)}
            {daysLoading && <span className="flex items-center gap-1 py-2 text-sm text-slate-400"><RefreshCw className="animate-spin" size={14}/>Đang tải…</span>}
            {!daysLoading && !days.length && <span className="py-2 text-sm text-slate-400">Chưa có ngày nào</span>}
          </div>
        </div>
        {isAdmin && <>
          <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(event) => { const files = [...(event.target.files ?? [])]; event.target.value = ''; void upload(files) }}/>
          <button className="btn-primary" disabled={busy || !chatDate} onClick={() => fileInput.current?.click()}>{busy ? <Loader2 className="animate-spin" size={17}/> : <ImagePlus size={17}/>}{busy ? `Đang tải ${progress!.done}/${progress!.total}` : 'Tải ảnh lên'}</button>
          <button className="btn-danger" disabled={busy || !images.length} onClick={() => void removeDay()}><Trash2 size={16}/>Xóa ngày</button>
        </>}
      </div>
    </section>

    <section
      className={`mt-4 overflow-hidden rounded-xl border bg-white shadow-sm ${dragOver ? 'border-brand-500 ring-2 ring-brand-500/30' : ''}`}
      onDragOver={isAdmin ? (event) => { event.preventDefault(); setDragOver(true) } : undefined}
      onDragLeave={isAdmin ? () => setDragOver(false) : undefined}
      onDrop={isAdmin ? (event) => { event.preventDefault(); setDragOver(false); void upload([...event.dataTransfer.files]) } : undefined}
    >
      <div className="flex items-center justify-between border-b px-4 py-2 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><Images size={14}/>{chatDate ? `${images.length} ảnh · ${formatDate(chatDate)}` : 'Chưa chọn ngày'}</span>
        {isAdmin && <span className="hidden sm:inline">Kéo thả ảnh vào đây hoặc nhấn Ctrl+V để dán ảnh</span>}
      </div>
      {imagesLoading ? <div className="flex items-center justify-center gap-2 py-16 text-slate-500"><Loader2 className="animate-spin" size={18}/>Đang tải ảnh…</div>
        : !images.length ? <div className="px-4 py-16 text-center text-sm text-slate-500">{isAdmin ? 'Chưa có ảnh cho ngày này. Nhấn “Tải ảnh lên”, kéo thả hoặc dán ảnh.' : 'Chưa có ảnh cận date NM2.'}</div>
        : <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {images.map((image, index) => <figure key={image.id} className="group relative overflow-hidden rounded-lg border bg-slate-50">
            <button type="button" className="block w-full" onClick={() => setViewing(index)} aria-label={`Xem ảnh ${index + 1}`}>
              <img src={image.dataUrl} alt={`Ảnh cận date NM2 số ${index + 1}`} loading="lazy" className="aspect-[3/4] w-full object-cover transition group-hover:opacity-90"/>
            </button>
            <figcaption className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs text-slate-500">
              <span>Ảnh {index + 1}{image.createdAt ? ` · ${image.createdAt.toDate().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
              {isAdmin && <button type="button" className="rounded p-1 text-rose-600 hover:bg-rose-50" onClick={() => void removeImage(image)} aria-label={`Xóa ảnh ${index + 1}`}><Trash2 size={14}/></button>}
            </figcaption>
          </figure>)}
        </div>}
    </section>

    {viewing !== undefined && images[viewing] && <Lightbox images={images} index={viewing} chatDate={chatDate} onChange={setViewing} onClose={() => setViewing(undefined)}/>}
  </>
}

const ZOOM_LEVELS = [1, 1.5, 2, 3, 4]

function Lightbox({ images, index, chatDate, onChange, onClose }: { images: Nm2Image[]; index: number; chatDate: string; onChange: (index: number) => void; onClose: () => void }) {
  const [zoom, setZoom] = useState(0)
  const image = images[index]
  const count = images.length
  const go = useCallback((step: number) => { setZoom(0); onChange((index + step + count) % count) }, [index, count, onChange])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      else if (event.key === 'ArrowRight') go(1)
      else if (event.key === 'ArrowLeft') go(-1)
      else if (event.key === '+' || event.key === '=') setZoom((value) => Math.min(value + 1, ZOOM_LEVELS.length - 1))
      else if (event.key === '-') setZoom((value) => Math.max(value - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose])

  const scale = ZOOM_LEVELS[zoom]
  return <div className="fixed inset-0 z-[70] flex flex-col bg-slate-950/95 text-white" role="dialog" aria-modal="true" aria-label="Xem ảnh NM2">
    <header className="flex items-center justify-between gap-2 px-3 py-2">
      <span className="text-sm font-semibold">Ảnh {index + 1}/{count} · {formatDate(chatDate)}</span>
      <div className="flex items-center gap-1">
        <button className="header-btn px-2.5" disabled={zoom === 0} onClick={() => setZoom(zoom - 1)} aria-label="Thu nhỏ"><ZoomOut size={17}/></button>
        <span className="w-12 text-center text-xs tabular-nums">{Math.round(scale * 100)}%</span>
        <button className="header-btn px-2.5" disabled={zoom === ZOOM_LEVELS.length - 1} onClick={() => setZoom(zoom + 1)} aria-label="Phóng to"><ZoomIn size={17}/></button>
        <a className="header-btn px-2.5" href={image.dataUrl} download={`nm2-${chatDate}-anh-${index + 1}.jpg`} aria-label="Tải ảnh về"><Download size={17}/></a>
        <button className="header-btn px-2.5" onClick={onClose} aria-label="Đóng"><X size={18}/></button>
      </div>
    </header>
    <div className="relative min-h-0 flex-1">
      <div className={`h-full w-full overflow-auto ${zoom === 0 ? 'grid place-items-center' : ''}`} onDoubleClick={() => setZoom(zoom === 0 ? 2 : 0)}>
        <img
          src={image.dataUrl}
          alt={`Ảnh cận date NM2 số ${index + 1}`}
          className={zoom === 0 ? 'max-h-full max-w-full object-contain' : 'max-w-none'}
          style={zoom === 0 ? undefined : { width: `${scale * 100}%` }}
          draggable={false}
        />
      </div>
      {count > 1 && <>
        <button className="absolute left-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/50 hover:bg-black/70" onClick={() => go(-1)} aria-label="Ảnh trước"><ChevronLeft size={22}/></button>
        <button className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/50 hover:bg-black/70" onClick={() => go(1)} aria-label="Ảnh sau"><ChevronRight size={22}/></button>
      </>}
    </div>
  </div>
}
