import { describe, expect, it } from 'vitest'
import { parseFactoryView } from './factoryView'

describe('parseFactoryView', () => {
  it('reads tab names from a hash or stored value', () => {
    expect(parseFactoryView('#nm2')).toBe('nm2')
    expect(parseFactoryView('NM1')).toBe('nm1')
  })

  it('ignores anything else', () => {
    expect(parseFactoryView('#other')).toBeUndefined()
    expect(parseFactoryView(null)).toBeUndefined()
  })
})
