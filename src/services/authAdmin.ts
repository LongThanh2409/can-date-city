// Tạo tài khoản Firebase Auth qua REST API (không cần Admin SDK)
// https://firebase.google.com/docs/reference/rest/auth#section-create-email-password

const API_KEY = import.meta.env.VITE_FIREBASE_API_KEY as string

export async function createFirebaseUser(email: string, password: string): Promise<string> {
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
