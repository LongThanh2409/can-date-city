import { TriangleAlert } from 'lucide-react'
import type { LotWarning } from '../domain/lotWarnings'

export function LotWarningNotes({ warnings, className = '' }: { warnings: LotWarning[]; className?: string }) {
  if (!warnings.length) return null
  return <ul className={`space-y-1 whitespace-normal rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs font-medium leading-snug text-amber-900 ${className}`}>
    {warnings.map((warning)=><li key={warning.id} className="flex gap-1.5"><TriangleAlert className="mt-px shrink-0 text-amber-600" size={13} aria-hidden="true"/><span>{warning.message}</span></li>)}
  </ul>
}
