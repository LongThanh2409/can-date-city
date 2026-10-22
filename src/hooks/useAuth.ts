import { useEffect, useState } from 'react'
import { onAuthStateChanged, signOut, type User } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import type { UserRole } from '../types'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [allowed, setAllowed] = useState(false)
  const [role, setRole] = useState<UserRole>('user')
  const [loading, setLoading] = useState(true)
  useEffect(() => onAuthStateChanged(auth, async (next) => {
    setUser(next)
    if (!next) { setAllowed(false); setRole('user'); setLoading(false); return }
    try {
      const access = await getDoc(doc(db, 'allowedUsers', next.uid))
      setAllowed(access.exists())
      const storedRole = String(access.data()?.role ?? '').trim().toLowerCase()
      setRole(storedRole === 'admin' || storedRole === 'sale' ? storedRole : 'user')
    }
    catch { setAllowed(false); setRole('user') }
    finally { setLoading(false) }
  }), [])
  return { user, allowed, role, loading, logout: () => signOut(auth) }
}
