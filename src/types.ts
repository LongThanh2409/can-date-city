import type { Timestamp } from 'firebase/firestore'

export type UserRole = 'admin' | 'sale' | 'user'

export interface AllowedUser {
  uid: string
  active: boolean
  displayName: string
  email: string
  role: UserRole
}

export interface AuditLog {
  id: string
  collection: 'dateRecords' | 'products' | 'allowedUsers'
  documentId: string
  action: 'create' | 'update' | 'delete'
  changedFields: string[]
  actorUid: string
  authType: string
  chatDate?: string
  productCode?: string
  occurredAt?: Timestamp
}

export interface Product {
  id: string
  productCode: string
  productName: string
  vietnameseName: string
  aliases: string[]
  productGroup: ProductGroup
  packaging: ProductPackaging
  active: boolean
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export type ProductGroup = 'ambient' | 'chilled' | 'sterilized-sausage' | 'frozen'
export type PackagingType = 'carton-only' | 'carton-pack' | 'carton-bag-pack' | 'basket-bag' | 'basket-bag-pack' | 'box-bag-pack' | 'box-pack'

export interface ProductPackaging {
  type: PackagingType
  packsPerCarton?: number
  bagsPerCarton?: number
  packsPerBag?: number
  bagsPerBasket?: number
  bagsPerBox?: number
  packsPerBox?: number
  note: string
}

export interface Lot {
  lotId: string
  productionDate: string
  quantity: number
  unit: string
  quantityBreakdown?: QuantityBreakdown
  datePercent: number
  lotLabel: string
}

export interface QuantityBreakdown {
  cartons?: number
  baskets?: number
  boxes?: number
  bags?: number
  packs?: number
}

export type QuantityUnitKey = keyof QuantityBreakdown

export interface DateRecord {
  id: string
  chatDate: string
  productId: string
  productCode: string
  productName: string
  vietnameseName: string
  isNewDate: boolean
  priorityOrder?: number
  saleNote?: string
  saleWorkflow?: SaleWorkflow
  lots: Lot[]
  createdAt?: Timestamp
  updatedAt?: Timestamp
  createdBy: string
  updatedBy: string
}

export type SaleStatus = 'pending' | 'in_progress' | 'done'
export type SalePriority = 'normal' | 'high' | 'urgent'

export interface SaleWorkflow {
  status: SaleStatus
  priority: SalePriority
  assigneeUid?: string
  dueDate?: string
}

export type ChangeStatus = 'increased' | 'decreased' | 'changed' | 'new-lot' | 'missing-lot' | 'unchanged' | 'unit-changed'

export interface ComparedLot {
  key: string
  current?: Lot
  previous?: Lot
  quantityDelta: number | null
  percentDelta: number | null
  status: ChangeStatus
}

export interface ComparedProduct {
  key: string
  productId: string
  productCode: string
  productName: string
  vietnameseName: string
  current?: DateRecord
  previous?: DateRecord
  lots: ComparedLot[]
  status: 'current-only' | 'previous-only' | 'changed' | 'unchanged'
}

export interface Filters {
  query: string
  productGroup: 'all' | ProductGroup
  newState: 'all' | 'new' | 'not-new'
  productionFrom: string
  productionTo: string
  percentMin: string
  percentMax: string
  presence: 'all' | 'one-side'
  noteState: 'all' | 'noted' | 'not-noted'
  warningState: 'all' | 'warning'
}

/** One photo of the second factory's near-date list, stored compressed inside Firestore (no Firebase Storage, no Blaze plan). */
export interface Nm2Image {
  id: string
  chatDate: string
  /** Small preview for the grid. */
  thumbDataUrl?: string
  /** Only on photos uploaded before thumbnails existed; newer full photos live in `nm2ImageData/{id}`. */
  dataUrl?: string
  mimeType: string
  width: number
  height: number
  fileName: string
  createdAt?: Timestamp
  createdBy: string
}

/** Lightweight per-day summary so the date list loads without downloading every photo. */
export interface Nm2Day {
  chatDate: string
  imageCount: number
  updatedAt?: Timestamp
  updatedBy: string
}
