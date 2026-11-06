import { AlertCircle, ChevronLeft, ChevronRight, Download, ImagePlus, Images, Loader2, RefreshCw, RotateCcw, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { formatDate, todayVietnam } from '../lib/date'
import { compressImageWithThumbnail, isImageFile } from '../lib/imageCompress'
import { NM2_RETENTION_DAYS, deleteNm2Date, deleteNm2Image, enforceNm2Retention, loadNm2FullImage, nm2ThumbnailUrl, subscribeNm2Days, subscribeNm2Images, uploadNm2Image } from '../services/nm2'
import type { Nm2Day, Nm2Image, UserRole } from '../types'
import { ImageGridSkeleton } from './Skeletons'

interface Props {
  role: UserRole
  userId: string
  notify: (message: string, error?: boolean) => void
  /** False while the other factory tab is shown; the panel stays mounted but ignores paste and keys. */
  active: boolean
}

interface QueueItem {
  key: string
  name: string
  previewUrl: string
  status: 'waiting' | 'compressing' | 'uploading' | 'error'
  error?: string
}

const STATUS_LABELS: Record<QueueItem['status'], string> = { waiting: 'Đang chờ…', compressing: 'Đang nén…', uploading: 'Đang gửi…', error: 'Lỗi' }
/** Uploads run in parallel with compressing the next photo; two at a time keeps the browser responsive. */
const MAX_PARALLEL_UPLOADS = 2

export function Nm2Panel({ role, userId, notify, active }: Props) {
  const isAdmin = role === 'admin'
  const [days, setDays] = useState<Nm2Day[]>([])
  const [daysLoading, setDaysLoading] = useState(true)
  const [chatDate, setChatDate] = useState(isAdmin ? todayVietnam() : '')
  const [images, setImages] = useState<Nm2Image[]>([])
  const [imagesLoading, setImagesLoading] = useState(false)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [viewing, setViewing] = useState<number>()
  const fileInput = useRef<HTMLInputElement>(null)
  const retentionChecked = useRef('')
  const keySeed = useRef(0)

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

  useEffect(() => { if (!active) setViewing(undefined) }, [active])

  useEffect(() => {
    if (!isAdmin || days.length <= NM2_RETENTION_DAYS) return
    const signature = days.map((day) => day.chatDate).join('|')
    if (retentionChecked.current === signature) return
    retentionChecked.current = signature
    void enforceNm2Retention(days).catch(() => notify('Không thể dọn ảnh NM2 quá hạn.', true))
  }, [isAdmin, days, notify])

  // Revoke preview URLs that are still around when the panel goes away.
  const queueRef = useRef(queue)
  useEffect(() => { queueRef.current = queue }, [queue])
  useEffect(() => () => queueRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl)), [])

  const busy = queue.some((item) => item.status !== 'error')

  const upload = useCallback(async (files: File[]) => {
    if (!isAdmin) return
    const accepted = files.filter(isImageFile)
    if (!accepted.length) { notify('Không có tệp ảnh nào để tải lên.', true); return }
    if (!chatDate) { notify('Hãy chọn ngày trước.', true); return }
    const targetDate = chatDate
    const items = accepted.map((file) => ({ file, item: { key: `upload-${keySeed.current++}`, name: file.name || 'anh.jpg', previewUrl: URL.createObjectURL(file), status: 'waiting' } as QueueItem }))
    setQueue((current) => [...current.filter((item) => item.status !== 'error'), ...items.map(({ item }) => item)])
    const update = (key: string, changes: Partial<QueueItem>) => setQueue((current) => current.map((item) => item.key === key ? { ...item, ...changes } : item))
    const finish = (item: QueueItem) => { URL.revokeObjectURL(item.previewUrl); setQueue((current) => current.filter((entry) => entry.key !== item.key)) }

    let saved = 0
    const running = new Set<Promise<void>>()
    for (const { file, item } of items) {
      update(item.key, { status: 'compressing' })
      let compressed: Awaited<ReturnType<typeof compressImageWithThumbnail>>
      try { compressed = await compressImageWithThumbnail(file) }
      catch (error) { update(item.key, { status: 'error', error: error instanceof Error ? error.message : 'Không nén được ảnh.' }); continue }
      update(item.key, { status: 'uploading' })
      const task = uploadNm2Image(targetDate, compressed.full, compressed.thumbnail, item.name, userId)
        .then(() => { saved += 1; finish(item) })
        .catch(() => update(item.key, { status: 'error', error: 'Gửi ảnh thất bại.' }))
        .finally(() => running.delete(task))
      running.add(task)
      if (running.size >= MAX_PARALLEL_UPLOADS) await Promise.race(running)
    }
    await Promise.all(running)
    if (saved) notify(`Đã tải ${saved} ảnh cho ngày ${formatDate(targetDate)}.`)
    if (saved < items.length) notify(`${items.length - saved} ảnh tải lên thất bại.`, true)
  }, [isAdmin, chatDate, userId, notify])

  // Admins can paste screenshots or photos copied from chat apps straight into the page.
  useEffect(() => {
    if (!isAdmin || !active) return
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
  }, [isAdmin, active, upload])

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

  function dismissError(item: QueueItem) {
    URL.revokeObjectURL(item.previewUrl)
    setQueue((current) => current.filter((entry) => entry.key !== item.key))
  }

  const uploading = queue.filter((item) => item.status !== 'error').length

  return <>
    <section className="rounded-xl border bg-white shadow-sm">
      <div className="flex flex-wrap items-end gap-3 p-4">
        {isAdmin && <div><label className="label" htmlFor="nm2-date">Ngày chát</label><input id="nm2-date" className="input w-44 font-semibold" type="date" value={chatDate} disabled={busy} onChange={(event) => setChatDate(event.target.value)}/></div>}
        <div className="min-w-0 flex-1">
          <label className="label">{NM2_RETENTION_DAYS} ngày gần nhất có ảnh</label>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {days.slice(0, NM2_RETENTION_DAYS).map((day) => <button key={day.chatDate} className={`date-chip ${day.chatDate === chatDate ? 'date-chip-active' : ''}`} disabled={busy} onClick={() => setChatDate(day.chatDate)}>{formatDate(day.chatDate)} · {day.imageCount}</button>)}
            {daysLoading && <span className="flex items-center gap-1 py-2 text-sm text-slate-400"><RefreshCw className="animate-spin" size={14}/>Đang tải…</span>}
            {!daysLoading && !days.length && <span className="py-2 text-sm text-slate-400">Chưa có ngày nào</span>}
          </div>
        </div>
        {isAdmin && <>
          <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(event) => { const files = [...(event.target.files ?? [])]; event.target.value = ''; void upload(files) }}/>
          <button className="btn-primary" disabled={busy || !chatDate} onClick={() => fileInput.current?.click()}>{busy ? <Loader2 className="animate-spin" size={17}/> : <ImagePlus size={17}/>}{busy ? `Đang tải ${uploading} ảnh…` : 'Tải ảnh lên'}</button>
          <button className="btn-danger" disabled={busy || !images.length} onClick={() => void removeDay()}><Trash2 size={16}/>Xóa ngày</button>
        </>}
      </div>
    </section>

    <section
      className={`mt-4 overflow-hidden rounded-xl border bg-white shadow-sm transition ${dragOver ? 'border-brand-500 ring-2 ring-brand-500/30' : ''}`}
      onDragOver={isAdmin ? (event) => { event.preventDefault(); setDragOver(true) } : undefined}
      onDragLeave={isAdmin ? () => setDragOver(false) : undefined}
      onDrop={isAdmin ? (event) => { event.preventDefault(); setDragOver(false); if (!busy) void upload([...event.dataTransfer.files]) } : undefined}
    >
      <div className="flex items-center justify-between border-b px-4 py-2 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><Images size={14}/>{chatDate ? `${images.length} ảnh · ${formatDate(chatDate)}` : 'Chưa chọn ngày'}</span>
        {isAdmin && <span>Kéo thả ảnh vào đây hoặc nhấn Ctrl+V để dán ảnh</span>}
      </div>
      {imagesLoading && !queue.length ? <ImageGridSkeleton/>
        : !images.length && !queue.length ? <div className="px-4 py-16 text-center text-sm text-slate-500">{isAdmin ? 'Chưa có ảnh cho ngày này. Nhấn “Tải ảnh lên”, kéo thả hoặc dán ảnh.' : 'Chưa có ảnh cận date NM2.'}</div>
        : <div className="grid grid-cols-3 gap-3 p-3 lg:grid-cols-4 xl:grid-cols-5">
          {images.map((image, index) => <figure key={image.id} className="group relative overflow-hidden rounded-lg border bg-slate-50">
            <button type="button" className="block w-full" onClick={() => setViewing(index)} aria-label={`Xem ảnh ${index + 1}`}>
              <img src={nm2ThumbnailUrl(image)} alt={`Ảnh cận date NM2 số ${index + 1}`} loading="lazy" decoding="async" className="aspect-[3/4] w-full object-cover transition group-hover:opacity-90"/>
            </button>
            <figcaption className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs text-slate-500">
              <span>Ảnh {index + 1}{image.createdAt ? ` · ${image.createdAt.toDate().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
              {isAdmin && <button type="button" className="rounded p-1 text-rose-600 hover:bg-rose-50" onClick={() => void removeImage(image)} aria-label={`Xóa ảnh ${index + 1}`}><Trash2 size={14}/></button>}
            </figcaption>
          </figure>)}
          {queue.map((item) => <figure key={item.key} className="relative overflow-hidden rounded-lg border bg-slate-50">
            <img src={item.previewUrl} alt="" className={`aspect-[3/4] w-full object-cover ${item.status === 'error' ? 'opacity-40' : 'opacity-60'}`}/>
            <div className="absolute inset-x-0 top-0 flex aspect-[3/4] items-center justify-center">
              {item.status === 'error'
                ? <span className="flex max-w-[90%] items-center gap-1 rounded-md bg-rose-600 px-2 py-1 text-xs font-semibold text-white"><AlertCircle size={14}/>{item.error ?? 'Lỗi'}</span>
                : <span className="flex items-center gap-1.5 rounded-md bg-slate-900/75 px-2 py-1 text-xs font-semibold text-white"><Loader2 className="animate-spin" size={14}/>{STATUS_LABELS[item.status]}</span>}
            </div>
            <figcaption className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs text-slate-500">
              <span className="truncate">{item.name}</span>
              {item.status === 'error' && <button type="button" className="rounded p-1 hover:bg-slate-200" onClick={() => dismissError(item)} aria-label="Bỏ ảnh lỗi"><X size={14}/></button>}
            </figcaption>
          </figure>)}
        </div>}
    </section>

    {active && viewing !== undefined && images[viewing] && <Lightbox images={images} index={viewing} chatDate={chatDate} onChange={setViewing} onClose={() => setViewing(undefined)}/>}
  </>
}

const MIN_SCALE = 1
const MAX_SCALE = 6
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

interface View { scale: number; x: number; y: number }
const FIT: View = { scale: 1, x: 0, y: 0 }

/** Desktop viewer: wheel zooms at the cursor, drag pans, double-click toggles zoom, arrow keys move between photos. */
function Lightbox({ images, index, chatDate, onChange, onClose }: { images: Nm2Image[]; index: number; chatDate: string; onChange: (index: number) => void; onClose: () => void }) {
  const image = images[index]
  const count = images.length
  const [view, setView] = useState<View>(FIT)
  const [full, setFull] = useState<{ id: string; url: string }>()
  const [loadError, setLoadError] = useState(false)
  const stage = useRef<HTMLDivElement>(null)
  const picture = useRef<HTMLImageElement>(null)
  /** Keeps the zoomed photo covering the screen: it can't be dragged past its own edges. */
  const bounded = useCallback((next: View): View => {
    const box = stage.current, img = picture.current
    if (!box || !img || next.scale <= MIN_SCALE) return FIT
    const limitX = Math.max(0, (img.offsetWidth * next.scale - box.clientWidth) / 2)
    const limitY = Math.max(0, (img.offsetHeight * next.scale - box.clientHeight) / 2)
    return { scale: next.scale, x: clamp(next.x, -limitX, limitX), y: clamp(next.y, -limitY, limitY) }
  }, [])
  const drag = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | undefined>(undefined)
  const [dragging, setDragging] = useState(false)

  const go = useCallback((step: number) => { setView(FIT); onChange((index + step + count) % count) }, [index, count, onChange])

  // Full photo for the current image, and warm the neighbours so arrow keys feel instant.
  useEffect(() => {
    let cancelled = false
    setLoadError(false)
    loadNm2FullImage(image).then((url) => { if (!cancelled) setFull({ id: image.id, url }) }).catch(() => { if (!cancelled) setLoadError(true) })
    if (count > 1) {
      void loadNm2FullImage(images[(index + 1) % count]).catch(() => undefined)
      void loadNm2FullImage(images[(index - 1 + count) % count]).catch(() => undefined)
    }
    return () => { cancelled = true }
  }, [image, images, index, count])

  /** Zoom to `nextScale` keeping the point (px, py), relative to the stage centre, fixed on screen. */
  const zoomAt = useCallback((nextScale: number, px: number, py: number) => {
    setView((current) => {
      const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE)
      if (scale === MIN_SCALE) return FIT
      const ratio = scale / current.scale
      return bounded({ scale, x: px - (px - current.x) * ratio, y: py - (py - current.y) * ratio })
    })
  }, [bounded])

  const pointFromEvent = (clientX: number, clientY: number) => {
    const rect = stage.current?.getBoundingClientRect()
    return rect ? { px: clientX - rect.left - rect.width / 2, py: clientY - rect.top - rect.height / 2 } : { px: 0, py: 0 }
  }

  // React's wheel handler is passive, so attach natively to be able to stop the page from scrolling.
  useEffect(() => {
    const element = stage.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      const px = event.clientX - rect.left - rect.width / 2
      const py = event.clientY - rect.top - rect.height / 2
      setView((current) => {
        const scale = clamp(current.scale * Math.exp(-event.deltaY * 0.0015), MIN_SCALE, MAX_SCALE)
        if (scale === MIN_SCALE) return FIT
        const ratio = scale / current.scale
        return bounded({ scale, x: px - (px - current.x) * ratio, y: py - (py - current.y) * ratio })
      })
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [bounded])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      else if (event.key === 'ArrowRight') go(1)
      else if (event.key === 'ArrowLeft') go(-1)
      else if (event.key === '+' || event.key === '=') zoomAt(view.scale * 1.5, 0, 0)
      else if (event.key === '-') zoomAt(view.scale / 1.5, 0, 0)
      else if (event.key === '0') setView(FIT)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose, zoomAt, view.scale])

  // Keep the page behind the viewer from scrolling.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  const src = full?.id === image.id ? full.url : nm2ThumbnailUrl(image)
  const loadingFull = full?.id !== image.id && !loadError
  const zoomed = view.scale > MIN_SCALE

  return <div className="fixed inset-0 z-[70] flex flex-col bg-slate-950/95 text-white" role="dialog" aria-modal="true" aria-label="Xem ảnh NM2">
    <header className="flex items-center justify-between gap-2 px-3 py-2">
      <span className="flex items-center gap-2 text-sm font-semibold">Ảnh {index + 1}/{count} · {formatDate(chatDate)}{loadingFull && <Loader2 className="animate-spin text-slate-400" size={15}/>}{loadError && <span className="text-xs font-normal text-rose-300">Không tải được ảnh gốc, đang hiện ảnh thu nhỏ</span>}</span>
      <div className="flex items-center gap-1">
        <span className="mr-2 hidden text-xs text-slate-400 lg:inline">Lăn chuột để phóng to · kéo để di chuyển · nhấp đúp để phóng/thu</span>
        <button className="header-btn px-2.5" disabled={!zoomed} onClick={() => zoomAt(view.scale / 1.5, 0, 0)} aria-label="Thu nhỏ"><ZoomOut size={17}/></button>
        <span className="w-12 text-center text-xs tabular-nums">{Math.round(view.scale * 100)}%</span>
        <button className="header-btn px-2.5" disabled={view.scale >= MAX_SCALE} onClick={() => zoomAt(view.scale * 1.5, 0, 0)} aria-label="Phóng to"><ZoomIn size={17}/></button>
        <button className="header-btn px-2.5" disabled={!zoomed} onClick={() => setView(FIT)} aria-label="Vừa màn hình"><RotateCcw size={16}/></button>
        <a className={`header-btn px-2.5 ${full?.id === image.id ? '' : 'pointer-events-none opacity-50'}`} href={full?.id === image.id ? full.url : undefined} download={`nm2-${chatDate}-anh-${index + 1}.jpg`} aria-label="Tải ảnh về"><Download size={17}/></a>
        <button className="header-btn px-2.5" onClick={onClose} aria-label="Đóng"><X size={18}/></button>
      </div>
    </header>
    <div
      ref={stage}
      className={`relative min-h-0 flex-1 select-none overflow-hidden ${zoomed ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'}`}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: view.x, originY: view.y, moved: false }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        const state = drag.current
        if (!state || state.pointerId !== event.pointerId || !zoomed) return
        const dx = event.clientX - state.startX, dy = event.clientY - state.startY
        if (!state.moved && Math.hypot(dx, dy) < 3) return
        state.moved = true
        setDragging(true)
        setView((current) => bounded({ ...current, x: state.originX + dx, y: state.originY + dy }))
      }}
      onPointerUp={(event) => { if (drag.current?.pointerId === event.pointerId) { drag.current = undefined; setDragging(false) } }}
      onPointerCancel={() => { drag.current = undefined; setDragging(false) }}
      onDoubleClick={(event) => { if (zoomed) setView(FIT); else { const { px, py } = pointFromEvent(event.clientX, event.clientY); zoomAt(2.5, px, py) } }}
    >
      <div className="absolute inset-0 flex items-center justify-center p-2">
        <img
          ref={picture}
          src={src}
          alt={`Ảnh cận date NM2 số ${index + 1}`}
          draggable={false}
          className="max-h-full max-w-full object-contain will-change-transform"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transition: dragging ? 'none' : 'transform 120ms ease-out' }}
        />
      </div>
      {count > 1 && <>
        <button className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/50 hover:bg-black/70" onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} onClick={() => go(-1)} aria-label="Ảnh trước"><ChevronLeft size={22}/></button>
        <button className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/50 hover:bg-black/70" onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} onClick={() => go(1)} aria-label="Ảnh sau"><ChevronRight size={22}/></button>
      </>}
    </div>
    {count > 1 && <div className="flex justify-center gap-1.5 overflow-x-auto px-3 py-2">
      {images.map((item, itemIndex) => <button key={item.id} type="button" onClick={() => { setView(FIT); onChange(itemIndex) }} aria-label={`Ảnh ${itemIndex + 1}`} className={`h-14 w-11 shrink-0 overflow-hidden rounded border-2 transition ${itemIndex === index ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'}`}>
        <img src={nm2ThumbnailUrl(item)} alt="" className="h-full w-full object-cover"/>
      </button>)}
    </div>}
  </div>
}
