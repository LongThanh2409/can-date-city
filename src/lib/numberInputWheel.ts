/**
 * Browsers step a focused number input when the wheel turns over it, which silently
 * changes quantities and percentages. Blurring keeps the value and lets the wheel scroll the page.
 */
export function preventNumberInputWheelChange(target: Document = document) {
  target.addEventListener('wheel', (event) => {
    const input = event.target
    if (input instanceof HTMLInputElement && input.type === 'number' && input === target.activeElement) input.blur()
  }, { passive: true, capture: true })
}
