export type FactoryView = 'nm1' | 'nm2'

const STORAGE_KEY = 'chat-can-date:factory-view'

export function parseFactoryView(value: string | null | undefined): FactoryView | undefined {
  const clean = value?.replace(/^#/, '').trim().toLowerCase()
  return clean === 'nm1' || clean === 'nm2' ? clean : undefined
}

/** The URL hash wins (so `#nm2` links open factory 2), then the last tab used on this computer. */
export function initialFactoryView(): FactoryView {
  if (typeof window === 'undefined') return 'nm1'
  const fromHash = parseFactoryView(window.location.hash)
  if (fromHash) return fromHash
  try { return parseFactoryView(window.localStorage.getItem(STORAGE_KEY)) ?? 'nm1' } catch { return 'nm1' }
}

export function rememberFactoryView(view: FactoryView) {
  try { window.localStorage.setItem(STORAGE_KEY, view) } catch { /* storage may be blocked */ }
  if (parseFactoryView(window.location.hash) !== view) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${view}`)
}
