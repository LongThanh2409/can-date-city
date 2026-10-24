import { initializeApp } from 'firebase/app'
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)
export const firebaseApp = initializeApp(firebaseConfig)
const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY as string | undefined
const appCheckDebugToken = import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN as string | undefined
if (appCheckSiteKey && typeof window !== 'undefined') {
  if (import.meta.env.DEV && appCheckDebugToken) {
    ;(globalThis as typeof globalThis & { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckDebugToken === 'true' ? true : appCheckDebugToken
  }
  initializeAppCheck(firebaseApp,{provider:new ReCaptchaEnterpriseProvider(appCheckSiteKey),isTokenAutoRefreshEnabled:true})
}
export const auth = getAuth(firebaseApp)
export const db = getFirestore(firebaseApp)
