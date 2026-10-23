import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onDocumentWrittenWithAuthContext } from 'firebase-functions/v2/firestore'

initializeApp()
const db = getFirestore()
const REGION = 'asia-southeast1'
const VALID_ROLES = new Set(['admin','sale','user'])

async function assertAdmin(uid?: string) {
  if (!uid) throw new HttpsError('unauthenticated','Bạn cần đăng nhập.')
  const access = await db.doc(`allowedUsers/${uid}`).get()
  if (!access.exists || access.data()?.active === false || access.data()?.role !== 'admin') throw new HttpsError('permission-denied','Chỉ quản trị viên được thực hiện thao tác này.')
}

function text(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new HttpsError('invalid-argument',`${field} không hợp lệ.`)
  return value.trim()
}

function role(value: unknown) {
  const selected = text(value,'Vai trò').toLowerCase()
  if (!VALID_ROLES.has(selected)) throw new HttpsError('invalid-argument','Vai trò không hợp lệ.')
  return selected
}

export const createManagedUser = onCall({ region: REGION }, async (request) => {
  await assertAdmin(request.auth?.uid)
  const email = text(request.data?.email,'Email').toLowerCase()
  const password = text(request.data?.password,'Mật khẩu')
  const displayName = text(request.data?.displayName,'Tên hiển thị')
  const selectedRole = role(request.data?.role)
  if (password.length < 6) throw new HttpsError('invalid-argument','Mật khẩu phải có ít nhất 6 ký tự.')
  const active = request.data?.active !== false
  const user = await getAuth().createUser({ email, password, displayName, disabled:!active })
  try {
    await db.doc(`allowedUsers/${user.uid}`).set({ email,displayName,role:selectedRole,active })
  } catch (error) {
    await getAuth().deleteUser(user.uid).catch(()=>undefined)
    throw error
  }
  return { uid:user.uid }
})

export const updateManagedUser = onCall({ region: REGION }, async (request) => {
  await assertAdmin(request.auth?.uid)
  const uid = text(request.data?.uid,'UID')
  const displayName = text(request.data?.displayName,'Tên hiển thị')
  const email = text(request.data?.email,'Email').toLowerCase()
  const selectedRole = role(request.data?.role)
  const active = request.data?.active !== false
  if (uid === request.auth?.uid && (!active || selectedRole !== 'admin')) throw new HttpsError('failed-precondition','Không thể vô hiệu hóa hoặc hạ quyền tài khoản đang đăng nhập.')
  await getAuth().updateUser(uid,{ displayName,disabled:!active })
  await db.doc(`allowedUsers/${uid}`).set({ email,displayName,role:selectedRole,active },{ merge:true })
  return { uid }
})

export const deleteManagedUser = onCall({ region: REGION }, async (request) => {
  await assertAdmin(request.auth?.uid)
  const uid = text(request.data?.uid,'UID')
  if (uid === request.auth?.uid) throw new HttpsError('failed-precondition','Không thể xóa tài khoản đang đăng nhập.')
  await getAuth().deleteUser(uid).catch((error: { code?: string })=>{if(error.code!=='auth/user-not-found')throw error})
  await db.doc(`allowedUsers/${uid}`).delete()
  return { uid }
})

function changedFields(before: Record<string,unknown>, after: Record<string,unknown>) {
  return [...new Set([...Object.keys(before),...Object.keys(after)])].filter((key)=>JSON.stringify(before[key])!==JSON.stringify(after[key]))
}

function audit(collectionName: string) {
  return onDocumentWrittenWithAuthContext({ document:`${collectionName}/{documentId}`, region:REGION }, async (event) => {
    if (!event.data) return
    const before = event.data.before.exists ? event.data.before.data() : {}
    const after = event.data.after.exists ? event.data.after.data() : {}
    const action = !event.data.before.exists ? 'create' : !event.data.after.exists ? 'delete' : 'update'
    await db.collection('auditLogs').add({
      collection:collectionName,
      documentId:event.params.documentId,
      action,
      changedFields:changedFields(before,after),
      actorUid:event.authId??'system',
      authType:event.authType??'unknown',
      chatDate:String(after.chatDate??before.chatDate??''),
      productCode:String(after.productCode??before.productCode??''),
      occurredAt:FieldValue.serverTimestamp(),
    })
  })
}

export const auditDateRecords = audit('dateRecords')
export const auditProducts = audit('products')
export const auditAllowedUsers = audit('allowedUsers')

export const scheduledRetention = onSchedule({ schedule:'0 1 * * *',timeZone:'Asia/Ho_Chi_Minh',region:REGION },async()=>{
  const snapshot = await db.collection('dateRecords').get()
  const dates = Array.from(new Set<string>(snapshot.docs.map((item: QueryDocumentSnapshot)=>String(item.data().chatDate)))).sort((a,b)=>b.localeCompare(a))
  const expired = new Set(dates.slice(5))
  const documents = snapshot.docs.filter((item: QueryDocumentSnapshot)=>expired.has(String(item.data().chatDate)))
  for(let index=0;index<documents.length;index+=450){const batch=db.batch();documents.slice(index,index+450).forEach((item: QueryDocumentSnapshot)=>batch.delete(item.ref));await batch.commit()}
})
