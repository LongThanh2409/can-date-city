import { collection, doc, getDoc, getDocs, increment, onSnapshot, query, serverTimestamp, where, writeBatch, type Unsubscribe } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { datesToDelete } from '../domain/retention'
import type { CompressedImage } from '../lib/imageCompress'
import type { Nm2Day, Nm2Image } from '../types'

/** Light documents: metadata plus a small thumbnail, so the grid loads fast. */
const IMAGES = 'nm2Images'
/** Heavy documents with the full photo, same id as in IMAGES, fetched only when a photo is opened. */
const IMAGE_DATA = 'nm2ImageData'
const DAYS = 'nm2Days'
/** Factory 2 only needs the latest photos: keep the 2 most recent days that have photos. */
export const NM2_RETENTION_DAYS = 2

export function subscribeNm2Days(onData: (items: Nm2Day[]) => void, onError: (error: Error) => void): Unsubscribe {
  return onSnapshot(collection(db, DAYS), (snapshot) => {
    const days = snapshot.docs.map((item) => ({ ...item.data(), chatDate: item.id }) as Nm2Day)
    onData(days.filter((day) => day.imageCount > 0).sort((a, b) => b.chatDate.localeCompare(a.chatDate)))
  }, onError)
}

export function subscribeNm2Images(chatDate: string, onData: (items: Nm2Image[]) => void, onError: (error: Error) => void): Unsubscribe {
  // Sorted on the client so no composite index is needed.
  return onSnapshot(query(collection(db, IMAGES), where('chatDate', '==', chatDate)), (snapshot) => {
    const images = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Nm2Image)
    images.sort((a, b) => (a.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER) - (b.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id))
    onData(images)
  }, onError)
}

const fullImageCache = new Map<string, Promise<string>>()

/** Full-size photo for the viewer. Older uploads kept the photo inline in `dataUrl`. */
export function loadNm2FullImage(image: Nm2Image): Promise<string> {
  if (image.dataUrl) return Promise.resolve(image.dataUrl)
  let pending = fullImageCache.get(image.id)
  if (!pending) {
    pending = getDoc(doc(db, IMAGE_DATA, image.id)).then((snapshot) => {
      const dataUrl = snapshot.data()?.dataUrl
      if (typeof dataUrl !== 'string') throw new Error('Không tìm thấy ảnh gốc.')
      return dataUrl
    })
    pending.catch(() => fullImageCache.delete(image.id))
    fullImageCache.set(image.id, pending)
  }
  return pending
}

export function nm2ThumbnailUrl(image: Nm2Image): string {
  return image.thumbDataUrl ?? image.dataUrl ?? ''
}

export async function uploadNm2Image(chatDate: string, full: CompressedImage, thumbnail: CompressedImage, fileName: string, userId: string): Promise<void> {
  const ref = doc(collection(db, IMAGES))
  const batch = writeBatch(db)
  batch.set(doc(db, IMAGE_DATA, ref.id), { chatDate, dataUrl: full.dataUrl, createdBy: userId })
  batch.set(ref, {
    chatDate,
    thumbDataUrl: thumbnail.dataUrl,
    mimeType: full.mimeType,
    width: full.width,
    height: full.height,
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
  batch.delete(doc(db, IMAGE_DATA, image.id))
  const day = doc(db, DAYS, image.chatDate)
  if (remainingOnDay <= 1) batch.delete(day)
  else batch.set(day, { chatDate: image.chatDate, imageCount: increment(-1), updatedAt: serverTimestamp(), updatedBy: userId }, { merge: true })
  await batch.commit()
  fullImageCache.delete(image.id)
}

/** Deletes a day by the ids of its light documents, so the full photos are never downloaded just to delete them. */
export async function deleteNm2Date(chatDate: string): Promise<number> {
  const snapshot = await getDocs(query(collection(db, IMAGES), where('chatDate', '==', chatDate)))
  const ids = snapshot.docs.map((item) => item.id)
  for (let index = 0; index < ids.length; index += 200) {
    const batch = writeBatch(db)
    ids.slice(index, index + 200).forEach((id) => { batch.delete(doc(db, IMAGES, id)); batch.delete(doc(db, IMAGE_DATA, id)); fullImageCache.delete(id) })
    await batch.commit()
  }
  const finish = writeBatch(db)
  finish.delete(doc(db, DAYS, chatDate))
  await finish.commit()
  return ids.length
}

export async function enforceNm2Retention(days: Nm2Day[]): Promise<string[]> {
  const expired = datesToDelete(days.map((day) => day.chatDate), NM2_RETENTION_DAYS)
  for (const chatDate of expired) await deleteNm2Date(chatDate)
  return expired
}
