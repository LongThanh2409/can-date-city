import { useState, type FormEvent } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { LockKeyhole, PackageCheck } from 'lucide-react'
import { auth, firebaseConfigured } from '../lib/firebase'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true)
    try { await signInWithEmailAndPassword(auth, email.trim(), password) }
    catch { setError('Không thể đăng nhập. Kiểm tra email, mật khẩu và quyền truy cập.') }
    finally { setBusy(false) }
  }
  return <main className="min-h-screen bg-[#eaf1ef] grid place-items-center p-6">
    <section className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-panel">
      <div className="bg-brand-900 p-8 text-white">
        <div className="mb-5 grid h-12 w-12 place-items-center rounded-xl bg-white/10"><PackageCheck size={27}/></div>
        <p className="text-xs font-semibold uppercase tracking-[.22em] text-teal-200">Quản lý kho</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Chat Cận Date</h1>
        <p className="mt-2 text-sm leading-6 text-teal-50/75">Theo dõi lô, đối chiếu biến động và đồng bộ dữ liệu theo ngày.</p>
      </div>
      <form className="space-y-5 p-8" onSubmit={submit}>
        <div><label className="label">Email</label><input className="input" type="email" autoComplete="username" required value={email} onChange={(e)=>setEmail(e.target.value)} /></div>
        <div><label className="label">Mật khẩu</label><input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e)=>setPassword(e.target.value)} /></div>
        {!firebaseConfigured && <p className="notice notice-warn">Chưa cấu hình Firebase. Hãy tạo file <code>.env.local</code> từ <code>.env.example</code>.</p>}
        {error && <p className="notice notice-error">{error}</p>}
        <button className="btn-primary w-full" disabled={busy || !firebaseConfigured}><LockKeyhole size={17}/>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
      </form>
    </section>
  </main>
}
