import { describe, expect, it } from 'vitest'
import { fitWithin, isImageFile } from './imageCompress'

describe('fitWithin', () => {
  it('keeps small images unchanged', () => {
    expect(fitWithin(800, 600, 2048)).toEqual({ width: 800, height: 600 })
  })

  it('shrinks the longer side to the limit and keeps the ratio', () => {
    expect(fitWithin(4032, 3024, 2048)).toEqual({ width: 2048, height: 1536 })
    expect(fitWithin(3024, 4032, 2048)).toEqual({ width: 1536, height: 2048 })
  })

  it('handles empty sizes', () => {
    expect(fitWithin(0, 100, 2048)).toEqual({ width: 0, height: 0 })
  })
})

describe('isImageFile', () => {
  it('accepts image mime types and common extensions', () => {
    expect(isImageFile({ type: 'image/png', name: 'a.png' })).toBe(true)
    expect(isImageFile({ type: '', name: 'IMG_0001.HEIC' })).toBe(true)
  })

  it('rejects other files', () => {
    expect(isImageFile({ type: 'application/pdf', name: 'a.pdf' })).toBe(false)
  })
})
