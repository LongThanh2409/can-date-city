import { getFunctions, httpsCallable } from 'firebase/functions'
import type { AllowedUser } from '../types'
import { deleteAllowedUser, saveAllowedUser } from './firestore'

const API_KEY = import.meta.env.VITE_FIREBASE_API_KEY as string
const useAdminFunctions = import.meta.env.VITE_USE_ADMIN_FUNCTIONS === 'true'
const functions = getFunctions(undefined,'asia-southeast1')

async function createFirebaseUser(email: string, password: string): Promise<string> {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: false }),
    },
  )
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as { error?: { message?: string } }
    const msg = errorData.error?.message ?? 'Tạo tài khoản thất bại.'
    if (msg === 'EMAIL_EXISTS') throw new Error('Email này đã tồn tại.')
    if (msg.startsWith('WEAK_PASSWORD')) throw new Error('Mật khẩu phải từ 6 ký tự trở lên.')
    if (msg === 'INVALID_EMAIL') throw new Error('Email không hợp lệ.')
    throw new Error(msg)
  }
  const data = await response.json() as { localId: string }
  return data.localId
}

export async function createManagedUser(user: Omit<AllowedUser,'uid'>, password: string): Promise<string> {
  if (useAdminFunctions) {
    const result = await httpsCallable<typeof user & {password:string},{uid:string}>(functions,'createManagedUser')({...user,password})
    return result.data.uid
  }
  const uid = await createFirebaseUser(user.email,password)
  try { await saveAllowedUser({uid,...user}); return uid }
  catch { throw new Error('Đã tạo tài khoản đăng nhập nhưng chưa cấp được quyền. Hãy kiểm tra Firebase Console.') }
}

export async function updateManagedUser(user: AllowedUser): Promise<void> {
  if (useAdminFunctions) { await httpsCallable<AllowedUser,{uid:string}>(functions,'updateManagedUser')(user); return }
  await saveAllowedUser(user)
}

export async function removeManagedUser(uid: string): Promise<void> {
  if (useAdminFunctions) { await httpsCallable<{uid:string},{uid:string}>(functions,'deleteManagedUser')({uid}); return }
  await deleteAllowedUser(uid)
}
