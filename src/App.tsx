import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ArrowDownAZ, Bell, ChevronDown, Cloud, Copy, Eye, FilterX, History, LogOut, Package, PackageOpen, Plus, RefreshCw, Search, Settings2, Sparkles, Trash2, TriangleAlert, Users } from 'lucide-react'
import { compareRecords, comparisonStats } from './domain/compare'
import { closestPreviousDate, formatDate, previousCalendarDay, todayVietnam } from './lib/date'
import { subscribeProducts, subscribeRecords, deleteChatDate, enforceRetention, updateRecordPriorities } from './services/firestore'
import type { DateRecord, Filters, Product, ProductGroup } from './types'
import { useAuth } from './hooks/useAuth'
import { Login } from './components/Login'
import { RecordDrawer } from './components/RecordDrawer'
import { ComparisonTable } from './components/ComparisonTable'
import { ProductPicker } from './components/ProductPicker'
import { CloneDateDialog } from './components/CloneDateDialog'
import { PRODUCT_GROUP_LABELS, packagingSummary } from './domain/product'
import { recordNeedsAttention } from './domain/alerts'

const emptyFilters: Filters = { query:'', productGroup:'all', newState:'all', change:'all', productionFrom:'', productionTo:'', percentMin:'', percentMax:'', presence:'all', noteState:'all' }
const ProductManager = lazy(()=>import('./components/ProductManager').then((module)=>({default:module.ProductManager})))
const ReportExportDialog = lazy(()=>import('./components/ReportExportDialog').then((module)=>({default:module.ReportExportDialog})))
const AdminPanel = lazy(()=>import('./components/AdminPanel').then((module)=>({default:module.AdminPanel})))
const AuditPanel = lazy(()=>import('./components/AuditPanel').then((module)=>({default:module.AuditPanel})))

function App() {
  const { user, allowed, role, loading, logout } = useAuth()
  const [products,setProducts]=useState<Product[]>([]), [records,setRecords]=useState<DateRecord[]>([])
  const [chatDate,setChatDate]=useState(todayVietnam()), [compareDate,setCompareDate]=useState(previousCalendarDay(todayVietnam()))
  const [manualCompare,setManualCompare]=useState(false), [filters,setFilters]=useState(emptyFilters)
  const [drawerProduct,setDrawerProduct]=useState<Product>(), [productsOpen,setProductsOpen]=useState(false), [showFilters,setShowFilters]=useState(false)
  const [showStats,setShowStats]=useState(false)
  const [drawerStartsWithNewLot,setDrawerStartsWithNewLot]=useState(false)
  const [pickerOpen,setPickerOpen]=useState(false)
  const [sort,setSort]=useState<'priority'|'created'|'code'|'name'|'status'>('created'), [descending,setDescending]=useState(false), [page,setPage]=useState(1)
  const [showPreviousOnly,setShowPreviousOnly]=useState(false)
  const [reorderBusy,setReorderBusy]=useState(false)
  const [reportOpen,setReportOpen]=useState(false)
  const [adminOpen,setAdminOpen]=useState(false)
  const [cloneOpen,setCloneOpen]=useState(false)
  const [auditOpen,setAuditOpen]=useState(false)
  const [showAlerts,setShowAlerts]=useState(false)
  const [dataLoading,setDataLoading]=useState(true)
  const retentionChecked=useRef('')
  const toastTimer=useRef<number | undefined>(undefined)
  const [connection,setConnection]=useState<'connecting'|'online'|'error'>('connecting'), [toast,setToast]=useState<{message:string;error?:boolean}>()
  const notify=(message:string,error=false)=>{window.clearTimeout(toastTimer.current);setToast({message,error});toastTimer.current=window.setTimeout(()=>setToast(undefined),3500)}
  useEffect(()=>()=>window.clearTimeout(toastTimer.current),[])
  useEffect(()=>{if(!allowed){setDataLoading(true);return};setDataLoading(true);setConnection('connecting');const a=subscribeProducts(setProducts,()=>{setConnection('error');notify('Mất kết nối danh mục.',true)});const b=subscribeRecords((items)=>{setRecords(items);setDataLoading(false);setConnection('online')},()=>{setDataLoading(false);setConnection('error');notify('Không thể đồng bộ dữ liệu.',true)});return()=>{a();b()}},[allowed])
  const availableDates=useMemo(()=>[...new Set(records.map(r=>r.chatDate))].sort().reverse(),[records])
  const recentDates=useMemo(()=>availableDates.slice(0,5),[availableDates])
  useEffect(()=>{if(!allowed||role!=='admin')return; const signature=availableDates.join('|');if(connection==='online'&&availableDates.length>5&&retentionChecked.current!==signature){retentionChecked.current=signature;void enforceRetention(records).catch(()=>notify('Không thể áp dụng chính sách lưu trữ tự động.',true))}},[availableDates,connection,records,role,allowed])
  useEffect(()=>{if(role!=='sale'||!recentDates.length||recentDates.includes(chatDate))return;setChatDate(recentDates[0]);setManualCompare(false)},[role,recentDates,chatDate])
  useEffect(()=>{if(manualCompare)return; const yesterday=previousCalendarDay(chatDate); const chosen=availableDates.includes(yesterday)?yesterday:closestPreviousDate(chatDate,availableDates); setCompareDate(chosen??yesterday)},[chatDate,availableDates,manualCompare])
  const current=useMemo(()=>records.filter(r=>r.chatDate===chatDate),[records,chatDate]), previous=useMemo(()=>records.filter(r=>r.chatDate===compareDate),[records,compareDate])
  const compared=useMemo(()=>compareRecords(current,previous),[current,previous]), stats=useMemo(()=>comparisonStats(compared),[compared])
  const previousOnlyCount=useMemo(()=>compared.filter((row)=>!row.current&&row.previous).length,[compared])
  const filtered=useMemo(()=>compared.filter(row=>{
    if(!row.current&&(role!=='admin'||!showPreviousOnly))return false
    const activeRecord=row.current??row.previous!
    const product=products.find((item)=>item.id===row.productId)
    const q=filters.query.toLowerCase(); if(q&&!`${row.productCode} ${row.productName} ${row.vietnameseName} ${product?PRODUCT_GROUP_LABELS[product.productGroup]:''} ${product?packagingSummary(product):''}`.toLowerCase().includes(q))return false
    if(filters.productGroup!=='all'&&product?.productGroup!==filters.productGroup)return false
    const hasNote=Boolean(row.current?.saleNote?.trim())
    if(filters.noteState==='noted'&&!hasNote)return false
    if(filters.noteState==='not-noted'&&hasNote)return false
    if(filters.newState==='new'&&!activeRecord.isNewDate)return false; if(filters.newState==='not-new'&&activeRecord.isNewDate)return false
    if(filters.presence==='one-side'&&row.current&&row.previous)return false
    if(filters.change!=='all'&&row.status!==filters.change&&!row.lots.some(l=>l.status===filters.change))return false
    return row.lots.some(l=>{const lot=l.current??l.previous!; return (!filters.productionFrom||lot.productionDate>=filters.productionFrom)&&(!filters.productionTo||lot.productionDate<=filters.productionTo)&&(!filters.percentMin||lot.datePercent>=Number(filters.percentMin))&&(!filters.percentMax||lot.datePercent<=Number(filters.percentMax))})
  }).sort((a,b)=>{
    const direction=descending?-1:1
    if(sort==='priority'){
      if(Boolean(a.current)!==Boolean(b.current))return a.current?-1:1
      const left=a.current?.priorityOrder??a.previous?.priorityOrder??Number.MAX_SAFE_INTEGER
      const right=b.current?.priorityOrder??b.previous?.priorityOrder??Number.MAX_SAFE_INTEGER
      return (left-right||a.productCode.localeCompare(b.productCode,'vi',{numeric:true}))*direction
    }
    if(sort==='created'){
      const left=(a.current??a.previous)?.createdAt?.toMillis?.()??0
      const right=(b.current??b.previous)?.createdAt?.toMillis?.()??0
      return (left-right||a.productCode.localeCompare(b.productCode,'vi',{numeric:true}))*direction
    }
    const left=sort==='name'?a.vietnameseName:sort==='status'?a.status:a.productCode
    const right=sort==='name'?b.vietnameseName:sort==='status'?b.status:b.productCode
    return left.localeCompare(right,'vi',{numeric:true})*direction
  }),[compared,filters,sort,descending,products,role,showPreviousOnly])
  const alertRows=useMemo(()=>current.filter((record)=>recordNeedsAttention(record,todayVietnam())),[current])
  const pageSize=50, totalPages=Math.max(1,Math.ceil(filtered.length/pageSize)), actualPage=Math.min(page,totalPages), displayed=filtered.slice((actualPage-1)*pageSize,actualPage*pageSize)
  const previousDayDate=previousCalendarDay(chatDate)
  const previousDayRecords=useMemo(()=>records.filter(r=>r.chatDate===previousDayDate),[records,previousDayDate])
  const selectedProduct=drawerProduct, selectedRecord=selectedProduct?current.find(r=>r.productId===selectedProduct.id):undefined, selectedPreviousDay=selectedProduct?previousDayRecords.find(r=>r.productId===selectedProduct.id):undefined
  async function reorderRecords(sourceId: string, targetId: string) {
    if(role!=='admin'||!user||reorderBusy||sourceId===targetId)return
    const ordered=[...current].sort((a,b)=>(a.priorityOrder??Number.MAX_SAFE_INTEGER)-(b.priorityOrder??Number.MAX_SAFE_INTEGER)||a.productCode.localeCompare(b.productCode,'vi',{numeric:true}))
    const sourceIndex=ordered.findIndex((record)=>record.id===sourceId), targetIndex=ordered.findIndex((record)=>record.id===targetId)
    if(sourceIndex<0||targetIndex<0)return
    const [moved]=ordered.splice(sourceIndex,1)
    ordered.splice(targetIndex,0,moved)
    const updates=ordered.map((record,priorityOrder)=>({id:record.id,priorityOrder}))
    const previousOrders=new Map(current.map((record)=>[record.id,record.priorityOrder]))
    const nextOrders=new Map(updates.map((record)=>[record.id,record.priorityOrder]))
    setRecords((items)=>items.map((record)=>nextOrders.has(record.id)?{...record,priorityOrder:nextOrders.get(record.id)}:record))
    setReorderBusy(true)
    try { await updateRecordPriorities(updates,user.uid); notify('Đã lưu thứ tự ưu tiên các mã.') }
    catch { setRecords((items)=>items.map((record)=>previousOrders.has(record.id)?{...record,priorityOrder:previousOrders.get(record.id)}:record)); notify('Không thể lưu thứ tự ưu tiên.',true) }
    finally { setReorderBusy(false) }
  }
  useEffect(()=>setPage(1),[chatDate])
  useEffect(()=>{if(role!=='admin')setShowPreviousOnly(false)},[role])
  if(loading)return <div className="grid min-h-screen place-items-center bg-canvas"><RefreshCw className="animate-spin text-brand-600"/></div>
  if(!user)return <Login/>
  if(!allowed)return <main className="grid min-h-screen place-items-center bg-canvas p-6 text-center"><div><TriangleAlert className="mx-auto text-amber-500" size={46}/><h1 className="mt-4 text-2xl font-bold">Tài khoản chưa được cấp quyền</h1><p className="mt-2 text-slate-500">Quản trị viên cần tạo tài liệu <code>allowedUsers/{user.uid}</code> trong Firestore.</p><p className="mt-1 text-xs text-slate-400">UID: {user.uid}</p><button className="btn-secondary mx-auto mt-5" onClick={()=>void logout()}><LogOut size={16}/>Đăng xuất</button></div></main>
  return <div className="min-h-screen bg-canvas text-ink">
    <header className="border-b bg-brand-900 text-white"><div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-2 px-3 py-3 sm:px-5"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-lg bg-white/10"><Package size={20}/></div><div><h1 className="font-bold leading-tight">Chat Cận Date</h1><p className="hidden text-[11px] text-teal-100/70 sm:block">Đối chiếu dữ liệu kho theo ngày</p></div></div><div className="flex items-center gap-2"><span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-teal-100">{role==='admin'?'Quản trị':role==='sale'?'Sale':'Người xem'}</span><span className={`hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs md:flex ${connection==='online'?'bg-emerald-400/15 text-emerald-200':connection==='error'?'bg-rose-400/15 text-rose-200':'bg-white/10'}`}><Cloud size={14}/>{connection==='online'?'Đã đồng bộ':connection==='error'?'Lỗi kết nối':'Đang kết nối'}</span>{role==='admin'&&<><button className="header-btn relative px-2.5" onClick={()=>setShowAlerts(!showAlerts)} aria-label={`${alertRows.length} cảnh báo`}><Bell size={16}/>{alertRows.length>0&&<span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold">{alertRows.length}</span>}</button><button className="header-btn px-2.5" onClick={()=>setAuditOpen(true)} aria-label="Lịch sử hoạt động"><History size={16}/><span className="hidden lg:inline">Lịch sử</span></button><button className="header-btn px-2.5" onClick={()=>setProductsOpen(true)} aria-label="Danh mục sản phẩm"><Settings2 size={16}/><span className="hidden sm:inline">Danh mục</span></button><button className="header-btn px-2.5" onClick={()=>setAdminOpen(true)} aria-label="Quản lý người dùng"><Users size={16}/><span className="hidden sm:inline">Người dùng</span></button></>}<button className="icon-btn border-white/10 bg-white/5 text-white hover:bg-white/10" onClick={()=>void logout()} title="Đăng xuất" aria-label="Đăng xuất"><LogOut size={17}/></button></div></div></header>
    <main className="mx-auto max-w-[1800px] p-3 sm:p-4 lg:p-5">
      <section className="rounded-xl border bg-white shadow-sm"><div className="flex flex-wrap items-end gap-3 p-4">{role!=='sale'&&<><div><label className="label">Ngày chát hiện tại</label><input className="input w-44 font-semibold" type="date" value={chatDate} onChange={e=>{setChatDate(e.target.value);setManualCompare(false)}}/></div><div><label className="label">So sánh với</label><input className="input w-44" type="date" value={compareDate} onChange={e=>{setCompareDate(e.target.value);setManualCompare(true)}}/></div></>}<div className="min-w-0 flex-1"><label className="label">5 ngày gần nhất có dữ liệu</label><div className="flex gap-1.5 overflow-x-auto pb-0.5">{recentDates.map(d=><button key={d} className={`date-chip ${d===chatDate?'date-chip-active':''}`} onClick={()=>{setChatDate(d);setManualCompare(false)}}>{formatDate(d)}</button>)}{dataLoading&&<span className="flex items-center gap-1 py-2 text-sm text-slate-400"><RefreshCw className="animate-spin" size={14}/>Đang tải…</span>}{!dataLoading&&!recentDates.length&&<span className="py-2 text-sm text-slate-400">Chưa có ngày nào</span>}</div></div>{role==='admin'&&<><button className="btn-secondary" onClick={()=>setCloneOpen(true)} disabled={!availableDates.length}><Copy size={16}/>Sao chép ngày</button><button className="btn-secondary" onClick={async()=>{const old=await enforceRetention(records);notify(old.length?`Đã dọn dữ liệu quá hạn: ${old.map(formatDate).join(', ')}`:'Không có dữ liệu quá hạn.')}}><RefreshCw size={16}/>Kiểm tra lưu trữ</button><button className="btn-primary" onClick={()=>products.some(p=>p.active)?setPickerOpen(true):notify('Hãy thêm sản phẩm hoạt động trước.',true)}><Plus size={17}/>Thêm dữ liệu</button><button className="btn-danger" disabled={!current.length} onClick={async()=>{if(confirm(`Xóa toàn bộ ${current.length} bản ghi ngày ${formatDate(chatDate)}? Danh mục sản phẩm vẫn được giữ.`)){try{const count=await deleteChatDate(chatDate);notify(`Đã xóa ${count} bản ghi ngày ${formatDate(chatDate)}.`)}catch{notify('Xóa ngày thất bại.',true)}}}}><Trash2 size={16}/>Xóa ngày</button></>}</div>
        {role!=='sale'&&!previous.length&&<div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800"><TriangleAlert className="mr-2 inline" size={16}/>Ngày so sánh {formatDate(compareDate)} chưa có dữ liệu. Bảng không âm thầm dùng dữ liệu của ngày khác.</div>}
        {role!=='sale'&&!manualCompare&&previous.length>0&&compareDate!==previousCalendarDay(chatDate)&&<div className="border-t border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-800">Ngày liền trước không có dữ liệu; đang dùng ngày gần nhất trước đó: <strong>{formatDate(compareDate)}</strong>.</div>}
      </section>
      {showAlerts&&role!=='user'&&<section className="mt-4 overflow-hidden rounded-xl border border-amber-200 bg-amber-50 shadow-sm"><div className="flex items-center justify-between border-b border-amber-200 px-4 py-3"><div><h2 className="font-bold text-amber-950">Cần chú ý hôm nay</h2><p className="text-xs text-amber-800">Mã có % date từ 30% trở xuống, ưu tiên khẩn hoặc quá hạn xử lý.</p></div><button className="icon-btn h-8 w-8" onClick={()=>setShowAlerts(false)} aria-label="Đóng cảnh báo">×</button></div><div className="flex gap-2 overflow-x-auto p-3">{alertRows.map((record)=><button key={record.id} className="min-w-52 rounded-lg border border-amber-200 bg-white p-3 text-left shadow-sm hover:border-amber-400" onClick={()=>{setFilters({...emptyFilters,query:record.productCode});setPage(1)}}><strong className="text-brand-700">{record.productCode}</strong><p className="mt-1 line-clamp-1 text-xs text-slate-600">{record.vietnameseName||record.productName}</p><p className="mt-2 text-xs font-bold text-amber-800">Thấp nhất {Math.min(...record.lots.map((lot)=>lot.datePercent))}% date</p></button>)}{!alertRows.length&&<p className="px-2 py-4 text-sm text-amber-800">Không có cảnh báo nào trong ngày đang chọn.</p>}</div></section>}
      {role!=='sale'&&<section className="mt-4 overflow-hidden rounded-xl border bg-white shadow-sm">
        <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50" aria-expanded={showStats} onClick={()=>setShowStats(!showStats)}>
          <span className="flex items-center gap-2"><Activity className="text-brand-600" size={17}/>Thống kê nhanh</span>
          <span className="flex items-center gap-2 text-xs text-slate-500">{showStats?'Đóng':'Mở'}<ChevronDown className={`transition-transform ${showStats?'rotate-180':''}`} size={16}/></span>
        </button>
        {showStats&&<div className="grid grid-cols-2 gap-3 border-t bg-slate-50/60 p-3 lg:grid-cols-5">{([
          ['Mã hiện tại',stats.currentProducts,Package,'slate'],['Có thay đổi',stats.changedProducts,Activity,'amber'],['Lô mới tự động',stats.newLots,Sparkles,'blue'],['Người dùng đánh MỚI',stats.markedNew,Users,'indigo'],['Không còn ghi nhận',stats.missing,PackageOpen,'orange']
        ] as const).map(([label,value,Icon,tone])=><div className="stat-card" key={label}><div className={`stat-icon stat-${tone}`}><Icon size={19}/></div><div><p className="text-xs font-medium text-slate-500">{label}</p><p className="text-2xl font-bold tabular-nums">{value}</p></div></div>)}</div>}
      </section>}
      <section className="mt-4 overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="search-wrap min-w-60 flex-1"><Search/><input aria-label="Tìm sản phẩm" placeholder="Tìm mã, tên, nhóm hàng hoặc quy cách…" value={filters.query} onChange={e=>{setFilters({...filters,query:e.target.value});setPage(1)}}/></div>
          {role==='sale'?<select className="input w-auto" aria-label="Lọc ghi chú Sale" value={filters.noteState} onChange={e=>{setFilters({...filters,noteState:e.target.value as Filters['noteState']});setPage(1)}}><option value="all">Tất cả ghi chú</option><option value="noted">Đã ghi chú</option><option value="not-noted">Chưa ghi chú</option></select>:<>
            <select className="input w-auto" aria-label="Lọc nhóm hàng" value={filters.productGroup} onChange={e=>{setFilters({...filters,productGroup:e.target.value as 'all'|ProductGroup});setPage(1)}}><option value="all">Tất cả nhóm hàng</option>{Object.entries(PRODUCT_GROUP_LABELS).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select>
            <select className="input w-auto" value={filters.newState} onChange={e=>{setFilters({...filters,newState:e.target.value as Filters['newState']});setPage(1)}}><option value="all">Tất cả nhãn</option><option value="new">MỚI</option><option value="not-new">KHÔNG MỚI</option></select>
            <select className="input w-auto" value={filters.change} onChange={e=>{setFilters({...filters,change:e.target.value as Filters['change']});setPage(1)}}><option value="all">Mọi biến động</option><option value="current-only">Hôm nay có, hôm qua không</option><option value="increased">Tăng số lượng</option><option value="decreased">Giảm số lượng</option><option value="new-lot">Lô mới</option><option value="missing-lot">Không ghi nhận lô</option><option value="unit-changed">Đổi đơn vị</option><option value="unchanged">Không đổi</option></select>
            <select className="input w-auto" title="Sắp xếp" value={sort==='created'?(descending?'created_desc':'created_asc'):sort} onChange={e=>{const val=e.target.value;if(val==='created_asc'){setSort('created');setDescending(false)}else if(val==='created_desc'){setSort('created');setDescending(true)}else{setSort(val as 'priority'|'code'|'name');setDescending(false)}}}><option value="created_asc">Sắp xếp: Mới thêm ở dưới</option><option value="created_desc">Sắp xếp: Mới thêm trước</option><option value="priority">Sắp xếp: Thứ tự kéo thả</option><option value="code">Sắp xếp: Mã</option><option value="name">Sắp xếp: Tên</option></select>
            {sort!=='priority'&&<button className="icon-btn" onClick={()=>setDescending(!descending)} title="Đảo chiều sắp xếp" aria-label="Đảo chiều sắp xếp"><ArrowDownAZ className={descending?'rotate-180':''} size={17}/></button>}
            {role==='admin'&&<button type="button" aria-pressed={showPreviousOnly} className={showPreviousOnly?'btn-secondary border-amber-400 bg-amber-50 text-amber-800':'btn-secondary'} onClick={()=>{setShowPreviousOnly((value)=>!value);setPage(1)}}><PackageOpen size={16}/>{showPreviousOnly?'Ẩn mã hôm nay không có':`Kiểm tra mã hôm nay không có (${previousOnlyCount})`}</button>}
            <button className="btn-secondary" onClick={()=>setShowFilters(!showFilters)}><ChevronDown size={16}/>Bộ lọc</button>
            <button className="icon-btn" onClick={()=>{setFilters(emptyFilters);setPage(1)}} title="Xóa bộ lọc" aria-label="Xóa bộ lọc"><FilterX size={17}/></button>
          </>}
          <button className="btn-secondary" disabled={!filtered.length} onClick={()=>setReportOpen(true)}><Eye size={16}/>Xem trước &amp; xuất</button>
        </div>
        {role!=='sale'&&showFilters&&<div className="grid grid-cols-2 gap-3 border-b bg-slate-50 p-3 md:grid-cols-5"><div><label className="label">NSX từ</label><input className="input" type="date" value={filters.productionFrom} onChange={e=>{setFilters({...filters,productionFrom:e.target.value});setPage(1)}}/></div><div><label className="label">NSX đến</label><input className="input" type="date" value={filters.productionTo} onChange={e=>{setFilters({...filters,productionTo:e.target.value});setPage(1)}}/></div><div><label className="label">% date từ</label><input className="input" type="number" min="0" max="100" value={filters.percentMin} onChange={e=>{setFilters({...filters,percentMin:e.target.value});setPage(1)}}/></div><div><label className="label">% date đến</label><input className="input" type="number" min="0" max="100" value={filters.percentMax} onChange={e=>{setFilters({...filters,percentMax:e.target.value});setPage(1)}}/></div><div><label className="label">Phạm vi xuất hiện</label><select className="input" value={filters.presence} onChange={e=>{setFilters({...filters,presence:e.target.value as Filters['presence']});setPage(1)}}><option value="all">Cả hai / một ngày</option><option value="one-side">Chỉ một trong hai ngày</option></select></div></div>}
        <div className="flex items-center justify-between border-b bg-white px-4 py-2 text-xs text-slate-500"><span>Hiển thị {displayed.length}/{filtered.length} mã phù hợp · luôn hiển thị đầy đủ các lô{role==='admin'&&showPreviousOnly&&previousOnlyCount>0?` · đang hiện ${previousOnlyCount} mã hôm qua có, hôm nay không`:''}{role==='admin'&&sort==='priority'?' · Kéo mã sản phẩm để đổi ưu tiên':''}</span><span>{role==='sale'?formatDate(chatDate):`${formatDate(chatDate)} ↔ ${formatDate(compareDate)}`}</span></div><ComparisonTable rows={displayed} products={products} userId={user.uid} role={role} reorderEnabled={role==='admin'&&sort==='priority'} reorderBusy={reorderBusy} onReorder={(sourceId,targetId)=>void reorderRecords(sourceId,targetId)} onAddLot={(row)=>{const product=products.find((item)=>item.id===row.productId);if(product){setDrawerStartsWithNewLot(true);setDrawerProduct(product)}}} notify={notify}/>{totalPages>1&&<div className="flex items-center justify-end gap-2 border-t px-4 py-3"><button className="btn-secondary" disabled={actualPage===1} onClick={()=>setPage(actualPage-1)}>Trang trước</button><span className="text-xs text-slate-500">Trang {actualPage}/{totalPages}</span><button className="btn-secondary" disabled={actualPage===totalPages} onClick={()=>setPage(actualPage+1)}>Trang sau</button></div>}
      </section>
    </main>
    {pickerOpen&&<ProductPicker products={products} onClose={()=>setPickerOpen(false)} onPick={(product)=>{setPickerOpen(false);setDrawerStartsWithNewLot(false);setDrawerProduct(product)}}/>}{drawerProduct&&<RecordDrawer product={drawerProduct} chatDate={chatDate} current={selectedRecord} previous={selectedPreviousDay} previousDate={previousDayDate} canViewPreviousInline={role==='admin'} startWithNewLot={drawerStartsWithNewLot} userId={user.uid} onClose={()=>{setDrawerProduct(undefined);setDrawerStartsWithNewLot(false)}} notify={notify}/>}<Suspense fallback={<div className="fixed inset-0 z-[75] grid place-items-center bg-slate-950/40 text-white"><span className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3"><RefreshCw className="animate-spin" size={17}/>Đang tải công cụ…</span></div>}>{productsOpen&&<ProductManager products={products} onClose={()=>setProductsOpen(false)} notify={notify}/>} {reportOpen&&<ReportExportDialog rows={filtered} products={products} date={chatDate} onClose={()=>setReportOpen(false)} notify={notify}/>} {adminOpen&&role==='admin'&&<AdminPanel currentUid={user.uid} onClose={()=>setAdminOpen(false)} notify={notify}/>} {auditOpen&&role==='admin'&&<AuditPanel onClose={()=>setAuditOpen(false)}/>}</Suspense> {cloneOpen&&role==='admin'&&<CloneDateDialog availableDates={availableDates} defaultSourceDate={compareDate} defaultTargetDate={chatDate} userId={user.uid} onClose={()=>setCloneOpen(false)} onCompleted={(targetDate,message)=>{setCloneOpen(false);setChatDate(targetDate);setManualCompare(false);notify(message)}}/>} {toast&&<div className={`toast ${toast.error?'toast-error':'toast-success'}`} role="status" aria-live="polite">{toast.error?<TriangleAlert size={18}/>:<Cloud size={18}/>} {toast.message}</div>}
  </div>
}
export default App
