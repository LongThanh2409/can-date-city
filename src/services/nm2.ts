import { collection, doc, getDocs, increment, onSnapshot, query, serverTimestamp, where, writeBatch, type Unsubscribe } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { datesToDelete } from '../domain/retention'
import type { CompressedImage } from '../lib/imageCompress'
import type { Nm2Day, Nm2Image } from '../types'

const IMAGES = 'nm2Images'
const DAYS = 'nm2Days'
/** Factory 2 only needs the latest photos: keep the 2 most recent days that have photos. */
export const NM2_RETENTION_DAYS = 2

export function subscribeNm2Days(onData: (items: Nm2Day[]) => void, onError: (error: Error) => void): Unsubscribe {
  return onSnapshot(collection(db, DAYS), (snapshot) => {
    const days = snapshot.docs.map((item) => ({ ...item.data(), chatDate: item.id }) as Nm2Day)
    onData(days.filter((day) => day.imageCount > 0).sort((a, b) => b.chatDate.localeCompare(a.chatDate)))
  }, onError)
}

/** Only the selected day's photos are downloaded; each document carries a whole image. */
export function subscribeNm2Images(chatDate: string, onData: (items: Nm2Image[]) => void, onError: (error: Error) => void): Unsubscribe {
  // Sorted on the client so no composite index is needed.
  return onSnapshot(query(collection(db, IMAGES), where('chatDate', '==', chatDate)), (snapshot) => {
    const images = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Nm2Image)
    images.sort((a, b) => (a.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER) - (b.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id))
    onData(images)
  }, onError)
}

export async function uploadNm2Image(chatDate: string, image: CompressedImage, fileName: string, userId: string): Promise<void> {
  const batch = writeBatch(db)
  batch.set(doc(collection(db, IMAGES)), {
    chatDate,
    dataUrl: image.dataUrl,
    mimeType: image.mimeType,
    width: image.width,
    height: image.height,
    fileName: fileName.slice(0, 200),
    createdAt: serverTimestamp(),
    createdBy: userId,
  })
  batch.set(doc(db, DAYS, chatDate), { chatDate, imageCount: increment(1), updatedAt: serverTimestamp(), updatedBy: userId }, { merge: true })
  await batch.commit()
}

export async function deleteNm2Image(image: Nm2Image, remainingOnDay: number, userId: string): Promise<void> {
  const batch = writeBatch(db)
  batch.delete(doc(db, IMAGES, image.id))
  const day = doc(db, DAYS, image.chatDate)
  if (remainingOnDay <= 1) batch.delete(day)
  else batch.set(day, { chatDate: image.chatDate, imageCount: increment(-1), updatedAt: serverTimestamp(), updatedBy: userId }, { merge: true })
  await batch.commit()
}

export async function deleteNm2Date(chatDate: string): Promise<number> {
  const snapshot = await getDocs(query(collection(db, IMAGES), where('chatDate', '==', chatDate)))
  const docs = snapshot.docs
  for (let index = 0; index < docs.length; index += 450) {
    const batch = writeBatch(db)
    docs.slice(index, index + 450).forEach((item) => batch.delete(item.ref))
    await batch.commit()
  }
  const finish = writeBatch(db)
  finish.delete(doc(db, DAYS, chatDate))
  await finish.commit()
  return docs.length
}

export async function enforceNm2Retention(days: Nm2Day[]): Promise<string[]> {
  const expired = datesToDelete(days.map((day) => day.chatDate), NM2_RETENTION_DAYS)
  for (const chatDate of expired) await deleteNm2Date(chatDate)
  return expired
}
