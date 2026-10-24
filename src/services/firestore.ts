import { collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, updateDoc, where, writeBatch, type Unsubscribe } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { datesToDelete } from '../domain/retention'
import type { AllowedUser, AuditLog, DateRecord, Product, SaleWorkflow } from '../types'
import { normalizeProduct } from '../domain/product'

const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const BATCH_SIZE = 450

async function commitChunks<T>(items: T[], add: (batch: ReturnType<typeof writeBatch>, item: T) => void): Promise<void> {
  for (let index = 0; index < items.length; index += BATCH_SIZE) {
    const batch = writeBatch(db)
    items.slice(index, index + BATCH_SIZE).forEach((item) => add(batch, item))
    await batch.commit()
  }
}

export function subscribeProducts(onData: (items: Product[]) => void, onError: (error: Error) => void): Unsubscribe {
  return onSnapshot(query(collection(db, 'products'), orderBy('productCode')), (snapshot) => onData(snapshot.docs.map((item) => normalizeProduct({ id: item.id, ...item.data() } as Product))), onError)
}

export function subscribeRecords(onData: (items: DateRecord[]) => void, onError: (error: Error) => void): Unsubscribe {
  return onSnapshot(collection(db, 'dateRecords'), (snapshot) => onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as DateRecord)), onError)
}

export async function saveProduct(product: Omit<Product, 'createdAt' | 'updatedAt'>): Promise<void> {
  const ref = doc(db, 'products', product.id)
  const existing = await getDoc(ref)
  await setDoc(ref, { ...clean(product), createdAt: existing.data()?.createdAt ?? serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true })
}

export async function deleteProduct(id: string): Promise<void> {
  const used = await getDocs(query(collection(db, 'dateRecords'), where('productId', '==', id)))
  if (!used.empty) throw new Error('Sản phẩm đã có dữ liệu cận date và không thể xóa. Hãy chuyển sang trạng thái ngừng hoạt động.')
  await deleteDoc(doc(db, 'products', id))
}

export interface SaveRecordInput {
  record: Omit<DateRecord, 'createdAt' | 'updatedAt'>
  expectedUpdatedAt?: string
  force?: boolean
}

export async function saveDateRecord({ record, expectedUpdatedAt, force = false }: SaveRecordInput): Promise<void> {
  const ref = doc(db, 'dateRecords', record.id)
  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(ref)
    const existingIso = existing.data()?.updatedAt?.toDate?.().toISOString()
    if (!force && !expectedUpdatedAt && existing.exists()) {
      throw new Error('CONFLICT')
    }
    if (!force && expectedUpdatedAt && existingIso && existingIso !== expectedUpdatedAt) {
      throw new Error('CONFLICT')
    }
    transaction.set(ref, { ...clean(record), createdAt: existing.data()?.createdAt ?? serverTimestamp(), updatedAt: serverTimestamp() })
  })
}

export async function deleteDateRecord(id: string): Promise<void> {
  await deleteDoc(doc(db, 'dateRecords', id))
}

export async function updateSaleNote(recordId: string, saleNote: string, userId: string): Promise<void> {
  await updateDoc(doc(db, 'dateRecords', recordId), {
    saleNote,
    updatedBy: userId,
    updatedAt: serverTimestamp(),
  })
}

export async function updateRecordPriorities(records: Array<{ id: string; priorityOrder: number }>, userId: string): Promise<void> {
  await commitChunks(records, (batch, record) => batch.set(doc(db, 'dateRecords', record.id), {
    priorityOrder: record.priorityOrder,
    updatedBy: userId,
    updatedAt: serverTimestamp(),
  }, { merge: true }))
}

export async function updateSaleWorkflow(recordId: string, saleWorkflow: SaleWorkflow, userId: string): Promise<void> {
  await updateDoc(doc(db, 'dateRecords', recordId), {
    saleWorkflow: clean(saleWorkflow),
    updatedBy: userId,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteChatDate(chatDate: string): Promise<number> {
  const snapshot = await getDocs(query(collection(db, 'dateRecords'), where('chatDate', '==', chatDate)))
  await commitChunks(snapshot.docs, (batch, item) => batch.delete(item.ref))
  return snapshot.size
}

export async function enforceRetention(records: DateRecord[]): Promise<string[]> {
  const expired = datesToDelete(records.map((record) => record.chatDate))
  if (!expired.length) return []
  await commitChunks(records.filter((record) => expired.includes(record.chatDate)), (batch, record) => batch.delete(doc(db, 'dateRecords', record.id)))
  return expired
}

export async function importProducts(products: Omit<Product, 'createdAt' | 'updatedAt'>[]): Promise<void> {
  await commitChunks(products, (batch, product) => {
    const ref = doc(db, 'products', product.id)
    batch.set(ref, { ...clean(product), updatedAt: serverTimestamp(), createdAt: serverTimestamp() }, { merge: true })
  })
}

export async function bulkUpdateProducts(ids: string[], updates: Pick<Product, 'productGroup' | 'packaging'>): Promise<void> {
  await commitChunks(ids, (batch, id) => batch.set(doc(db, 'products', id), { ...clean(updates), updatedAt: serverTimestamp() }, { merge: true }))
}

export interface CloneDateResult {
  copied: number
  skipped: number
}

export async function cloneChatDate(sourceDate: string, targetDate: string, userId: string, copySaleNotes = false): Promise<CloneDateResult> {
  const [source, target] = await Promise.all([
    getDocs(query(collection(db, 'dateRecords'), where('chatDate', '==', sourceDate))),
    getDocs(query(collection(db, 'dateRecords'), where('chatDate', '==', targetDate))),
  ])
  const existingProducts = new Set(target.docs.map((item) => String(item.data().productId)))
  const sourceRecords = source.docs.map((item) => ({ id: item.id, ...item.data() }) as DateRecord)
  const recordsToCopy = sourceRecords.filter((record) => !existingProducts.has(record.productId))
  await commitChunks(recordsToCopy, (batch, record) => {
    const id = `${targetDate}_${record.productId}`
    const { createdAt: _createdAt, updatedAt: _updatedAt, ...recordData } = record
    void _createdAt
    void _updatedAt
    batch.set(doc(db, 'dateRecords', id), {
      ...clean({
      ...recordData,
      id,
      chatDate: targetDate,
      isNewDate: false,
      saleNote: copySaleNotes ? record.saleNote ?? '' : '',
      saleWorkflow: { status: 'pending', priority: 'normal' },
      createdBy: userId,
      updatedBy: userId,
      }),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  })
  return { copied: recordsToCopy.length, skipped: sourceRecords.length - recordsToCopy.length }
}

// ─── Allowed Users (Admin only) ──────────────────────────────────────────────

export function subscribeAllowedUsers(onData: (items: AllowedUser[]) => void, onError: (error: Error) => void): Unsubscribe {
  return onSnapshot(
    collection(db, 'allowedUsers'),
    (snapshot) => onData(snapshot.docs.map((item) => {
      const data = item.data()
      const email = typeof data.email === 'string' ? data.email.trim() : ''
      const displayName = typeof data.displayName === 'string' ? data.displayName.trim() : ''
      const storedRole = typeof data.role === 'string' ? data.role.trim().toLowerCase() : ''
      const role: AllowedUser['role'] = storedRole === 'admin' || storedRole === 'sale' ? storedRole : 'user'
      return {
        uid: item.id,
        active: data.active !== false,
        displayName,
        email,
        role,
      }
    }).sort((a, b) => (a.email || a.displayName || a.uid).localeCompare(b.email || b.displayName || b.uid, 'vi'))),
    onError,
  )
}

export function subscribeAuditLogs(onData: (items: AuditLog[]) => void, onError: (error: Error) => void): Unsubscribe {
  return onSnapshot(query(collection(db,'auditLogs'),orderBy('occurredAt','desc'),limit(100)),(snapshot)=>onData(snapshot.docs.map((item)=>({id:item.id,...item.data()}) as AuditLog)),onError)
}

export async function saveAllowedUser(user: AllowedUser): Promise<void> {
  const { uid, ...data } = user
  await setDoc(doc(db, 'allowedUsers', uid), clean(data), { merge: true })
}

export async function deleteAllowedUser(uid: string): Promise<void> {
  await deleteDoc(doc(db, 'allowedUsers', uid))
}
