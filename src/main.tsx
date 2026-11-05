import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { VersionBadge } from './components/VersionBadge'
import { preventNumberInputWheelChange } from './lib/numberInputWheel'

preventNumberInputWheelChange()

createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary><App /></ErrorBoundary><VersionBadge /></StrictMode>)
