import type { DateRecord } from '../types'

export function recordNeedsAttention(record: DateRecord, today: string, percentThreshold = 30): boolean {
  const workflow = record.saleWorkflow ?? { status:'pending',priority:'normal' }
  if (record.lots.some((lot)=>lot.datePercent<=percentThreshold)) return true
  if (workflow.status === 'done') return false
  return workflow.priority === 'urgent' || Boolean(workflow.dueDate && workflow.dueDate < today)
}
