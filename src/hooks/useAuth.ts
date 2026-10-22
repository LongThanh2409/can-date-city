import { useEffect, useState } from 'react'
import { onAuthStateChanged, signOut, type User } from 'firebase/auth'
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import type { UserRole } from '../types'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [allowed, setAllowed] = useState(false)
  const [role, setRole] = useState<UserRole>('user')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let stopAccess: Unsubscribe | undefined
    const stopAuth = onAuthStateChanged(auth, (next) => {
      stopAccess?.()
      stopAccess = undefined
    setUser(next)
    if (!next) { setAllowed(false); setRole('user'); setLoading(false); return }
      setLoading(true)
      stopAccess = onSnapshot(doc(db, 'allowedUsers', next.uid), (access) => {
        const data = access.data()
        const isActive = data?.active !== false
        setAllowed(access.exists() && isActive)
        const storedRole = String(data?.role ?? '').trim().toLowerCase()
        setRole(storedRole === 'admin' || storedRole === 'sale' ? storedRole : 'user')
        setLoading(false)
      }, () => {
        setAllowed(false)
        setRole('user')
        setLoading(false)
      })
    })
    return () => { stopAccess?.(); stopAuth() }
  }, [])
  return { user, allowed, role, loading, logout: () => signOut(auth) }
}
