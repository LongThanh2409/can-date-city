import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, FileSpreadsheet, PackageOpen, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { PACKAGING_TYPE_LABELS, PRODUCT_GROUP_LABELS, defaultPackaging, normalizeProduct, packagingSummary, validatePackaging } from '../domain/product'
import { downloadProductTemplate, exportProducts, parseProductFile } from '../lib/io'
import { bulkUpdateProducts, deleteProduct, importProducts, saveProduct } from '../services/firestore'
import type { PackagingType, Product, ProductGroup, ProductPackaging } from '../types'

type ProductForm = Omit<Product, 'createdAt' | 'updatedAt'>
type GroupFilter = 'all' | ProductGroup
type StatusFilter = 'all' | 'active' | 'inactive'
type PackagingFilter = 'all' | PackagingType

const packagingTypes = Object.keys(PACKAGING_TYPE_LABELS) as PackagingType[]
const blank = (): ProductForm => ({ id: '', productCode: '', productName: '', vietnameseName: '', aliases: [], productGroup: 'ambient', packaging: defaultPackaging(), active: true })
const groupBadge: Record<ProductGroup, string> = { ambient: 'badge', chilled: 'badge badge-blue', 'sterilized-sausage': 'badge badge-purple', frozen: 'badge bg-cyan-100 text-cyan-800' }

function packagingWithType(current: ProductPackaging, type: PackagingType): ProductPackaging {
  return {
    type,
    note: current.note,
    packsPerCarton: type === 'carton-pack' ? current.packsPerCarton : undefined,
    bagsPerCarton: type === 'carton-bag-pack' ? current.bagsPerCarton : undefined,
    packsPerBag: ['carton-bag-pack', 'basket-bag-pack', 'box-bag-pack'].includes(type) ? current.packsPerBag : undefined,
    bagsPerBasket: ['basket-bag', 'basket-bag-pack'].includes(type) ? current.bagsPerBasket : undefined,
    bagsPerBox: type === 'box-bag-pack' ? current.bagsPerBox : undefined,
    packsPerBox: type === 'box-pack' ? current.packsPerBox : undefined,
  }
}

function PackagingEditor({ value, onChange }: { value: ProductPackaging; onChange: (packaging: ProductPackaging) => void }) {
  return <section className="rounded-xl border border-brand-100 bg-brand-50 p-4">
    <div className="mb-3 flex items-center gap-2 text-brand-900"><PackageOpen size={18}/><h4 className="font-bold">Quy cách đóng gói</h4></div>
    <div><label className="label">Kiểu quy cách</label><select className="input" value={value.type} onChange={(event)=>onChange(packagingWithType(value,event.target.value as PackagingType))}>{packagingTypes.map((type)=><option value={type} key={type}>{PACKAGING_TYPE_LABELS[type]}</option>)}</select><p className="mt-1.5 text-xs text-slate-500">Quy cách không bị giới hạn theo nhóm hàng.</p></div>
    {value.type==='carton-pack'&&<div className="mt-3"><label className="label">Số gói trong 1 thùng</label><div className="flex items-center gap-2"><span className="whitespace-nowrap text-xs font-semibold text-slate-500">1 thùng =</span><input className="input" type="number" min="1" step="1" value={value.packsPerCarton??''} onChange={(event)=>onChange({...value,packsPerCarton:event.target.value?Number(event.target.value):undefined})}/><span className="text-xs font-semibold text-slate-500">gói</span></div></div>}
    {value.type==='carton-bag-pack'&&<div className="mt-3 grid grid-cols-2 gap-3"><div><label className="label">Số túi trong 1 thùng</label><div className="flex items-center gap-2"><input className="input" type="number" min="1" step="1" value={value.bagsPerCarton??''} onChange={(event)=>onChange({...value,bagsPerCarton:event.target.value?Number(event.target.value):undefined})}/><span className="text-xs font-semibold text-slate-500">túi</span></div></div><div><label className="label">Số gói trong 1 túi</label><div className="flex items-center gap-2"><input className="input" type="number" min="1" step="1" value={value.packsPerBag??''} onChange={(event)=>onChange({...value,packsPerBag:event.target.value?Number(event.target.value):undefined})}/><span className="text-xs font-semibold text-slate-500">gói</span></div></div></div>}
    {value.type==='basket-bag'&&<div className="mt-3"><label className="label">Số túi trong 1 rổ</label><div className="flex items-center gap-2"><span className="whitespace-nowrap text-xs font-semibold text-slate-500">1 rổ =</span><input className="input" type="number" min="1" step="1" value={value.bagsPerBasket??''} onChange={(event)=>onChange({...value,bagsPerBasket:event.target.value?Number(event.target.value):undefined})}/><span className="text-xs font-semibold text-slate-500">túi</span></div></div>}
    {value.type==='basket-bag-pack'&&<div className="mt-3 grid grid-cols-2 gap-3"><div><label className="label">Số túi trong 1 rổ</label><div className="flex items-center gap-2"><input className="input" type="number" min="1" step="1" value={value.bagsPerBasket??''} onChange={(event)=>onChange({...value,bagsPerBasket:event.target.value?Number(event.target.value):undefined})}/><span className="text-xs font-semibold text-slate-500">túi</span></div></div><div><label className="label">Số gói trong 1 túi</label><div className="flex items-center gap-2"><input className="input" type="number" min="1" step="1" value={value.packsPerBag??''} onChange={(event)=>onChange({...value,packsPerBag:event.target.value?Number(event.target.value):undefined})}/><span className="text-xs font-semibold text-slate-500">gói</span></div></div></div>}
    {value.type==='box-bag-pack'&&<div className="mt-3 grid grid-cols-2 gap-3"><div><label className="label">Số túi trong 1 hộp</label><div className="flex items-center gap-2"><input className="input" type="number" min="1" step="1" value={value.bagsPerBox??''} onChange={(event)=>onChange({...value,bagsPerBox:event.target.value?Number(event.target.value):undefined})}/><span className="text-xs font-semibold text-slate-500">túi</span></div></div><div><label className="label">Số gói trong 1 túi</label><div className="flex items-center gap-2"><input className="input" type="number" min="1" step="1" value={value.packsPerBag??''} onChange={(event)=>onChange({...value,packsPerBag:event.target.value?Number(event.target.value):undefined})}/><span className="text-xs font-semibold text-slate-500">gói</span></div></div></div>}
    {value.type==='box-pack'&&<div className="mt-3"><label className="label">Số gói trong 1 hộp</label><div className="flex items-center gap-2"><span className="whitespace-nowrap text-xs font-semibold text-slate-500">1 hộp =</span><input className="input" type="number" min="1" step="1" value={value.packsPerBox??''} onChange={(event)=>onChange({...value,packsPerBox:event.target.value?Number(event.target.value):undefined})}/><span className="text-xs font-semibold text-slate-500">gói</span></div></div>}
    <div className="mt-3"><label className="label">Ghi chú quy cách</label><input className="input" value={value.note} onChange={(event)=>onChange({...value,note:event.target.value})} placeholder="Ví dụ: thùng 2 lớp, gói 500g…"/></div>
  </section>
}

export function ProductManager({ products, onClose, notify }: { products: Product[]; onClose: () => void; notify: (message: string, error?: boolean) => void }) {
  const [query, setQuery] = useState('')
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [packagingFilter, setPackagingFilter] = useState<PackagingFilter>('all')
  const [form, setForm] = useState<ProductForm>(blank())
  const [editing, setEditing] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(()=>new Set())
  const [bulkEditing, setBulkEditing] = useState(false)
  const [bulkGroup, setBulkGroup] = useState<ProductGroup>('ambient')
  const [bulkPackaging, setBulkPackaging] = useState<ProductPackaging>(defaultPackaging())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof parseProductFile>>>([])
  const [templateBusy, setTemplateBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const shown = useMemo(() => products.filter((product) => {
    const text = `${product.productCode} ${product.productName} ${product.vietnameseName} ${product.aliases.join(' ')} ${PRODUCT_GROUP_LABELS[product.productGroup]} ${packagingSummary(product)}`
    if (!text.toLowerCase().includes(query.trim().toLowerCase())) return false
    if (groupFilter !== 'all' && product.productGroup !== groupFilter) return false
    if (statusFilter === 'active' && !product.active) return false
    if (statusFilter === 'inactive' && product.active) return false
    if (packagingFilter !== 'all' && product.packaging.type !== packagingFilter) return false
    return true
  }), [products, query, groupFilter, statusFilter, packagingFilter])
  const filtering = Boolean(query.trim()) || groupFilter !== 'all' || statusFilter !== 'all' || packagingFilter !== 'all'
  const allShownSelected = shown.length > 0 && shown.every((product)=>selectedIds.has(product.id))
  useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key!=='Escape')return;if(preview.length)setPreview([]);else onClose()};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[onClose,preview.length])

  function clearFilters() { setQuery(''); setGroupFilter('all'); setStatusFilter('all'); setPackagingFilter('all') }
  function toggleProduct(id: string) { setSelectedIds((current)=>{ const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next }) }
  function toggleShown() { setSelectedIds((current)=>{ const next = new Set(current); shown.forEach((product)=>allShownSelected?next.delete(product.id):next.add(product.id)); return next }) }

  function start(product?: Product) {
    setBulkEditing(false)
    setEditing(Boolean(product))
    if (!product) setForm(blank())
    else { const normalized = normalizeProduct(product); setForm({ id: normalized.id, productCode: normalized.productCode, productName: normalized.productName, vietnameseName: normalized.vietnameseName, aliases: normalized.aliases, productGroup: normalized.productGroup, packaging: { ...normalized.packaging }, active: normalized.active }) }
  }

  function startBulkEdit() {
    const first = products.find((product)=>selectedIds.has(product.id))
    if (!first) return
    setEditing(false); setBulkGroup(first.productGroup); setBulkPackaging({ ...first.packaging }); setBulkEditing(true)
  }

  async function submit() {
    if (!form.productCode.trim()) return notify('Mã sản phẩm là trường bắt buộc.', true)
    const packagingErrors = validatePackaging(form.packaging)
    if (packagingErrors.length) return notify(packagingErrors[0], true)
    const id = editing ? form.id : form.productCode.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-')
    if (!editing && products.some((product) => product.productCode.toLowerCase() === form.productCode.trim().toLowerCase())) return notify('Mã sản phẩm đã tồn tại.', true)
    try { await saveProduct({ ...form, id, productCode: form.productCode.trim().toUpperCase() }); start(); notify('Đã lưu sản phẩm và quy cách.') }
    catch { notify('Không thể lưu sản phẩm.', true) }
  }

  async function submitBulk() {
    const ids = [...selectedIds].filter((id)=>products.some((product)=>product.id===id))
    if (!ids.length) return notify('Hãy chọn ít nhất một mã sản phẩm.', true)
    const packagingErrors = validatePackaging(bulkPackaging)
    if (packagingErrors.length) return notify(packagingErrors[0], true)
    setBulkBusy(true)
    try { await bulkUpdateProducts(ids, { productGroup: bulkGroup, packaging: bulkPackaging }); notify(`Đã áp dụng nhóm hàng và quy cách cho ${ids.length} sản phẩm.`); setSelectedIds(new Set()); setBulkEditing(false) }
    catch { notify('Không thể cập nhật hàng loạt.', true) }
    finally { setBulkBusy(false) }
  }

  async function pick(file?: File) { if (!file) return; try { setPreview(await parseProductFile(file)) } catch { notify('Không thể đọc tệp. Hãy kiểm tra định dạng CSV/XLSX.', true) } finally { if (inputRef.current) inputRef.current.value = '' } }
  async function confirmImport() { const valid = preview.filter((product) => !product.error).map((product) => ({ id: product.id, productCode: product.productCode, productName: product.productName, vietnameseName: product.vietnameseName, aliases: product.aliases, productGroup: product.productGroup, packaging: product.packaging, active: product.active })); if (!valid.length) return notify('Không có dòng hợp lệ để nhập.', true); try { await importProducts(valid); notify(`Đã nhập/cập nhật ${valid.length} sản phẩm.`); setPreview([]) } catch { notify('Nhập danh mục thất bại.', true) } }
  async function getTemplate() { setTemplateBusy(true); try { await downloadProductTemplate(); notify('Đã tải file mẫu danh mục và quy cách.') } catch { notify('Không thể tạo file mẫu.', true) } finally { setTemplateBusy(false) } }

  return <div className="fixed inset-0 z-50 bg-slate-950/35 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
    <section className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b px-6 py-4"><div><h2 className="text-xl font-bold">Danh mục sản phẩm</h2><p className="text-sm text-slate-500">{products.length} mã · quản lý nhóm hàng và quy cách đóng gói</p></div><button className="icon-btn" onClick={onClose} aria-label="Đóng"><X/></button></header>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_440px]">
        <div className="flex min-h-0 flex-col border-r">
          <div className="border-b p-4"><div className="flex gap-2"><div className="search-wrap flex-1"><Search/><input placeholder="Tìm mã, tên, nhóm hàng, quy cách…" value={query} onChange={(event)=>setQuery(event.target.value)}/></div><button className="btn-secondary" disabled={templateBusy} onClick={()=>void getTemplate()} title="Tải file Excel mẫu đúng định dạng import"><Download size={16}/>{templateBusy?'Đang tạo…':'File mẫu'}</button><button className="btn-secondary" onClick={()=>inputRef.current?.click()}><FileSpreadsheet size={16}/>Nhập tệp</button><input ref={inputRef} className="hidden" type="file" accept=".csv,.xlsx,.xls" onChange={(event)=>void pick(event.target.files?.[0])}/><button className="btn-secondary" onClick={()=>void exportProducts(products,'xlsx')}><Download size={16}/>Xuất Excel</button></div><div className="mt-3 flex flex-wrap items-center gap-2"><select className="input min-w-44 flex-1" aria-label="Lọc theo nhóm hàng" value={groupFilter} onChange={(event)=>setGroupFilter(event.target.value as GroupFilter)}><option value="all">Tất cả nhóm hàng</option>{Object.entries(PRODUCT_GROUP_LABELS).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select><select className="input min-w-40 flex-1" aria-label="Lọc theo trạng thái" value={statusFilter} onChange={(event)=>setStatusFilter(event.target.value as StatusFilter)}><option value="all">Tất cả trạng thái</option><option value="active">Đang hoạt động</option><option value="inactive">Đã ngừng</option></select><select className="input min-w-48 flex-1" aria-label="Lọc theo kiểu quy cách" value={packagingFilter} onChange={(event)=>setPackagingFilter(event.target.value as PackagingFilter)}><option value="all">Tất cả quy cách</option>{packagingTypes.map((value)=><option value={value} key={value}>{PACKAGING_TYPE_LABELS[value]}</option>)}</select>{filtering&&<button className="btn-secondary" onClick={clearFilters}>Xóa lọc</button>}<span className="ml-auto text-xs font-medium text-slate-500">Hiển thị {shown.length}/{products.length} mã</span></div></div>
          {selectedIds.size>0&&<div className="flex items-center justify-between border-b border-brand-100 bg-brand-50 px-4 py-2.5"><p className="text-sm font-semibold text-brand-900">Đã chọn {selectedIds.size} mã</p><div className="flex gap-2"><button className="btn-secondary" onClick={()=>setSelectedIds(new Set())}>Bỏ chọn</button><button className="btn-primary" onClick={startBulkEdit}><Pencil size={16}/>Sửa hàng loạt</button></div></div>}
          <div className="min-h-0 overflow-auto"><table className="data-table"><thead><tr><th className="w-10"><input type="checkbox" aria-label="Chọn tất cả sản phẩm đang hiển thị" checked={allShownSelected} onChange={toggleShown}/></th><th>Mã</th><th>Tên tiếng Việt</th><th>Nhóm hàng</th><th>Quy cách</th><th>Trạng thái</th><th></th></tr></thead><tbody>{shown.map((product)=><tr key={product.id} className={selectedIds.has(product.id)?'bg-brand-50/60':''}><td><input type="checkbox" aria-label={`Chọn ${product.productCode}`} checked={selectedIds.has(product.id)} onChange={()=>toggleProduct(product.id)}/></td><td className="font-bold text-brand-700">{product.productCode}</td><td>{product.vietnameseName||'Chưa bổ sung tên'}{product.productName&&<span className="block text-xs text-slate-400">{product.productName}</span>}</td><td><span className={groupBadge[product.productGroup]}>{PRODUCT_GROUP_LABELS[product.productGroup]}</span></td><td><span className="font-medium">{packagingSummary(product)}</span>{product.packaging.note&&product.packaging.type!=='carton-only'&&<span className="block text-xs text-slate-400">{product.packaging.note}</span>}</td><td><span className={product.active?'badge badge-green':'badge'}>{product.active?'Hoạt động':'Ngừng'}</span></td><td><div className="flex justify-end gap-1"><button className="icon-btn" onClick={()=>start(product)} title="Sửa"><Pencil size={16}/></button><button className="icon-btn text-rose-600" title="Xóa" onClick={async()=>{if(confirm(`Xóa ${product.productCode}?`))try{await deleteProduct(product.id);notify('Đã xóa sản phẩm.')}catch(error){notify(error instanceof Error?error.message:'Không thể xóa.',true)}}}><Trash2 size={16}/></button></div></td></tr>)}{!shown.length&&<tr><td colSpan={7} className="py-10 text-center text-slate-500">Không có sản phẩm phù hợp với bộ lọc.</td></tr>}</tbody></table></div>
        </div>
        {bulkEditing?<aside className="overflow-auto p-5"><h3 className="font-bold">Sửa hàng loạt {selectedIds.size} sản phẩm</h3><p className="mb-4 mt-1 text-xs text-slate-500">Nhóm hàng và toàn bộ quy cách dưới đây sẽ được áp dụng cho các mã đã chọn. Mã và tên sản phẩm được giữ nguyên.</p><div className="space-y-4"><div><label className="label">Nhóm hàng áp dụng</label><select className="input" value={bulkGroup} onChange={(event)=>setBulkGroup(event.target.value as ProductGroup)}>{Object.entries(PRODUCT_GROUP_LABELS).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></div><PackagingEditor value={bulkPackaging} onChange={setBulkPackaging}/><div className="flex gap-2"><button className="btn-primary flex-1" disabled={bulkBusy} onClick={()=>void submitBulk()}>{bulkBusy?'Đang áp dụng…':`Áp dụng cho ${selectedIds.size} mã`}</button><button className="btn-secondary" disabled={bulkBusy} onClick={()=>setBulkEditing(false)}>Hủy</button></div></div></aside>:<aside className="overflow-auto p-5"><h3 className="font-bold">{editing?'Sửa sản phẩm':'Thêm sản phẩm'}</h3><p className="mb-4 mt-1 text-xs text-slate-500">Chỉ mã sản phẩm là bắt buộc; các thông tin khác có thể bổ sung sau.</p><div className="space-y-4"><div className="grid grid-cols-2 gap-3"><div><label className="label">Mã sản phẩm *</label><input className="input" disabled={editing} value={form.productCode} onChange={(event)=>setForm({...form,productCode:event.target.value})}/></div><div><label className="label">Nhóm hàng</label><select className="input" value={form.productGroup} onChange={(event)=>setForm({...form,productGroup:event.target.value as ProductGroup})}>{Object.entries(PRODUCT_GROUP_LABELS).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></div></div><div><label className="label">Tên sản phẩm</label><input className="input" value={form.productName} onChange={(event)=>setForm({...form,productName:event.target.value})}/></div><div><label className="label">Tên tiếng Việt</label><input className="input" value={form.vietnameseName} onChange={(event)=>setForm({...form,vietnameseName:event.target.value})}/></div><div><label className="label">Từ khóa (cách nhau bằng dấu phẩy)</label><input className="input" value={form.aliases.join(', ')} onChange={(event)=>setForm({...form,aliases:event.target.value.split(',').map((value)=>value.trim()).filter(Boolean)})}/></div><PackagingEditor value={form.packaging} onChange={(packaging)=>setForm({...form,packaging})}/><label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" checked={form.active} onChange={(event)=>setForm({...form,active:event.target.checked})}/> Đang hoạt động</label><div className="flex gap-2"><button className="btn-primary flex-1" onClick={()=>void submit()}>{editing?'Lưu thay đổi':'Thêm sản phẩm'}</button>{editing&&<button className="btn-secondary" onClick={()=>start()}><Plus size={16}/>Mới</button>}</div></div></aside>}
      </div>
      {preview.length>0&&<div className="absolute inset-8 z-10 m-auto max-h-[75vh] max-w-6xl overflow-auto rounded-xl border bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><h3 className="font-bold">Xem trước nhập danh mục</h3><button className="icon-btn" onClick={()=>setPreview([])}><X/></button></div><p className="my-3 text-sm text-slate-500">{preview.filter((product)=>!product.error).length} có thể nhập · {preview.filter((product)=>product.warning&&!product.error).length} cảnh báo · {preview.filter((product)=>product.error).length} lỗi. Dòng cảnh báo vẫn được nhập; mã đã có sẽ được cập nhật.</p><table className="data-table"><thead><tr><th>Mã</th><th>Tên tiếng Việt</th><th>Nhóm hàng</th><th>Quy cách</th><th>Kết quả</th></tr></thead><tbody>{preview.map((product,index)=><tr key={index}><td>{product.productCode||'—'}</td><td>{product.vietnameseName||'—'}</td><td>{PRODUCT_GROUP_LABELS[product.productGroup]}</td><td>{packagingSummary(product)}</td><td className={product.error?'text-rose-600':product.warning?'text-amber-700':'text-emerald-700'}>{product.error??product.warning??'Hợp lệ'}</td></tr>)}</tbody></table><div className="mt-4 flex justify-end gap-2"><button className="btn-secondary" onClick={()=>setPreview([])}>Hủy</button><button className="btn-primary" onClick={()=>void confirmImport()}>Nhập các dòng có thể nhập</button></div></div>}
    </section>
  </div>
}
