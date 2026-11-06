import type { FactoryView } from '../lib/factoryView'

const TABS: ReadonlyArray<readonly [FactoryView, string]> = [['nm1', 'Cận date NM1'], ['nm2', 'Cận date NM2']]

/** Two-tab switcher whose highlight slides between tabs instead of jumping. */
export function FactoryTabs({ view, onChange, onPreload }: { view: FactoryView; onChange: (view: FactoryView) => void; onPreload?: (view: FactoryView) => void }) {
  const activeIndex = TABS.findIndex(([value]) => value === view)
  return <nav className="relative mb-3 grid w-80 grid-cols-2 rounded-xl border bg-white p-1 shadow-sm" role="tablist" aria-label="Chọn nhà máy">
    <span aria-hidden className="tab-indicator absolute inset-y-1 left-1 rounded-lg bg-brand-600 shadow-sm" style={{ width: 'calc(50% - 4px)', transform: `translateX(${activeIndex * 100}%)` }}/>
    {TABS.map(([value, label], index) => <button
      key={value}
      type="button"
      role="tab"
      id={`tab-${value}`}
      aria-selected={view === value}
      aria-controls={`panel-${value}`}
      title={`${label} (Alt+${index + 1})`}
      className={`relative z-10 rounded-lg px-4 py-2 text-sm font-semibold transition-colors duration-200 ${view === value ? 'text-white' : 'text-slate-600 hover:text-brand-700'}`}
      onClick={() => onChange(value)}
      onMouseEnter={() => onPreload?.(value)}
      onFocus={() => onPreload?.(value)}
    >{label}</button>)}
  </nav>
}
