/** Grey placeholder blocks shown while data loads, so the layout appears at once instead of a lone spinner. */
function Bar({ className = '' }: { className?: string }) {
  return <span className={`skeleton block ${className}`}/>
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return <div className="divide-y" aria-busy="true" aria-label="Đang tải dữ liệu">
    {Array.from({ length: rows }, (_, index) => <div key={index} className="flex items-center gap-4 px-4 py-3">
      <Bar className="h-4 w-20"/>
      <Bar className="h-4 w-64"/>
      <Bar className="h-4 w-24"/>
      <Bar className="h-4 w-16"/>
      <Bar className="ml-auto h-4 w-32"/>
    </div>)}
  </div>
}

export function ImageGridSkeleton({ count = 10 }: { count?: number }) {
  return <div className="grid grid-cols-3 gap-3 p-3 lg:grid-cols-4 xl:grid-cols-5" aria-busy="true" aria-label="Đang tải ảnh">
    {Array.from({ length: count }, (_, index) => <div key={index} className="overflow-hidden rounded-lg border">
      <Bar className="aspect-[3/4] w-full rounded-none"/>
      <div className="px-2 py-2"><Bar className="h-3 w-20"/></div>
    </div>)}
  </div>
}

export function Nm2Skeleton() {
  return <>
    <section className="rounded-xl border bg-white p-4 shadow-sm"><div className="flex items-end gap-3"><Bar className="h-10 w-44"/><Bar className="h-10 w-72"/><Bar className="ml-auto h-10 w-32"/></div></section>
    <section className="mt-4 overflow-hidden rounded-xl border bg-white shadow-sm"><ImageGridSkeleton/></section>
  </>
}

export function AppShellSkeleton() {
  return <div className="min-h-screen bg-canvas" aria-busy="true" aria-label="Đang tải ứng dụng">
    <div className="h-[60px] bg-brand-900"/>
    <div className="mx-auto max-w-[1800px] p-5">
      <Bar className="mb-3 h-11 w-80 rounded-xl"/>
      <section className="rounded-xl border bg-white p-4 shadow-sm"><div className="flex items-end gap-3"><Bar className="h-10 w-44"/><Bar className="h-10 w-44"/><Bar className="h-10 flex-1"/></div></section>
      <section className="mt-4 overflow-hidden rounded-xl border bg-white shadow-sm"><div className="border-b p-3"><Bar className="h-10 w-full"/></div><TableSkeleton/></section>
    </div>
  </div>
}
