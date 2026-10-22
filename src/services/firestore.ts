import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, where, writeBatch, type Unsubscribe } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { datesToDelete } from '../domain/retention'
import type { DateRecord, Product } from '../types'
import { normalizeProduct } from '../domain/product'

const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

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

export async function deleteChatDate(chatDate: string): Promise<number> {
  const snapshot = await getDocs(query(collection(db, 'dateRecords'), where('chatDate', '==', chatDate)))
  const batch = writeBatch(db)
  snapshot.docs.forEach((item) => batch.delete(item.ref))
  await batch.commit()
  return snapshot.size
}

export async function enforceRetention(records: DateRecord[]): Promise<string[]> {
  const expired = datesToDelete(records.map((record) => record.chatDate))
  if (!expired.length) return []
  const batch = writeBatch(db)
  records.filter((record) => expired.includes(record.chatDate)).forEach((record) => batch.delete(doc(db, 'dateRecords', record.id)))
  await batch.commit()
  return expired
}

export async function importProducts(products: Omit<Product, 'createdAt' | 'updatedAt'>[]): Promise<void> {
  const batch = writeBatch(db)
  products.forEach((product) => {
    const ref = doc(db, 'products', product.id)
    batch.set(ref, { ...clean(product), updatedAt: serverTimestamp(), createdAt: serverTimestamp() }, { merge: true })
  })
  await batch.commit()
}

export async function bulkUpdateProducts(ids: string[], updates: Pick<Product, 'productGroup' | 'packaging'>): Promise<void> {
  for (let index = 0; index < ids.length; index += 450) {
    const batch = writeBatch(db)
    ids.slice(index, index + 450).forEach((id) => {
      batch.set(doc(db, 'products', id), { ...clean(updates), updatedAt: serverTimestamp() }, { merge: true })
    })
    await batch.commit()
  }
}
