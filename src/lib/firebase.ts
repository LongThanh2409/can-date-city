import { initializeApp } from 'firebase/app'
import { getToken, initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from 'firebase/app-check'
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
let appCheck: AppCheck | undefined
if (appCheckSiteKey && typeof window !== 'undefined') {
  if (import.meta.env.DEV && appCheckDebugToken) {
    ;(globalThis as typeof globalThis & { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckDebugToken === 'true' ? true : appCheckDebugToken
  }
  appCheck = initializeAppCheck(firebaseApp,{provider:new ReCaptchaEnterpriseProvider(appCheckSiteKey),isTokenAutoRefreshEnabled:true})
}
export async function ensureAppCheckReady(forceRefresh = false) {
  if (!appCheck) throw new Error(import.meta.env.PROD
    ? 'Website chưa được cấu hình App Check. Hãy kiểm tra VITE_FIREBASE_APPCHECK_SITE_KEY trên môi trường triển khai và redeploy.'
    : 'Local chưa được cấu hình App Check. Hãy kiểm tra site key và debug token trong .env.local.')
  try {
    const result = await getToken(appCheck,forceRefresh)
    if (!result.token) throw new Error('EMPTY_APPCHECK_TOKEN')
    return result.token
  } catch (error) {
    console.error('App Check token error',error)
    throw new Error(import.meta.env.PROD
      ? 'Không lấy được App Check token trên website. Hãy kiểm tra domain reCAPTCHA Enterprise và cấu hình Firebase App Check.'
      : 'App Check local chưa hợp lệ. Hãy safelist debug token của trình duyệt này trong Firebase Console.')
  }
}
export const auth = getAuth(firebaseApp)
export const db = getFirestore(firebaseApp)
