export type SaleNoteRun = { text: string; bold: boolean }
export type SaleNoteEmphasis = { runs: SaleNoteRun[]; emphasizeName: boolean; designatedPercents: number[] }

const NOT_SHIPPED = /(?:^|[^A-Z0-9])(?:K|KO|KHONG)\s+DI\b/
const SPECIAL_HANDLING = /\bDI\s+NOT\b|\bNOT\s+CAN\b|\bTRON\b|\bTI\s+LE\b/
// "DATE 9/10" is a production date and "1.879" a quantity, so neither may be read as a percent.
const DATE_VALUE = /(?:\b(TREN|TU)\s+)?\bDATE\s+(?:(TREN|TU)\s+)?(\d{1,3})(?![\d/]|\.\d)\s*%?((?:\s*(?:VA|,|\+)\s*\d{1,3}(?![\d/]|\.\d))*)/g
const BARE_PERCENT = /\bDI\s+(TREN\s+|TU\s+)?(\d{1,3})(?![\d/]|\.\d|\s*G(?:OI)?\b)/g
const FIFO_QUANTITY = /\bFIFO\s+(\d[\d.,]*(?:\s*G(?:OI)?)?)(?![\dA-Z/%])/
// Commas also separate customers ("AEON, BIGC ĐI DATE 66"), and "CÁC BHX CÒN LẠI ĐI DATE 67" is
// its own instruction, so "CÒN LẠI" only opens a clause after a separator or a finished date.
const CLAUSE_BOUNDARY = /\n|[,;]\s*(?=CON\s+LAI\b)|(?<=[\d%])\s+(?=CON\s+LAI\s+DI\b)/g

// Keeps every character at the same index, so a match on the folded text marks the original text.
function foldText(text: string) {
  return text.split('').map((char) => {
    const folded = char.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase().replace('Đ', 'D')
    return folded.length === 1 ? folded : char
  }).join('')
}

function clauseRanges(folded: string) {
  const starts = [0, ...[...folded.matchAll(CLAUSE_BOUNDARY)].map((match) => match.index + match[0].length)]
  return starts.map((start, index) => [start, starts[index + 1] ?? folded.length] as const)
}

// "ĐI DATE 70" names that exact date, so the lot is marked. "TRÊN 70" and "TỪ 67" are ranges and name no lot.
function exactPercents(clause: string) {
  const percents: number[] = []
  for (const match of clause.matchAll(DATE_VALUE)) {
    if (match[1] || match[2]) continue
    percents.push(Number(match[3]), ...[...match[4].matchAll(/\d+/g)].map((value) => Number(value[0])))
  }
  for (const match of clause.matchAll(BARE_PERCENT)) if (!match[1]) percents.push(Number(match[2]))
  return percents.filter((percent) => percent <= 100)
}

// A plain "ĐI FIFO" (also "SỸ ĐI FIFO", wholesale points) is the normal flow and a "K ĐI" line
// ships nothing, so both stay regular text. Bold is kept for what the storekeeper could get wrong:
// a date named for a customer, special handling, and the quantity limit of a FIFO line.
export function analyzeSaleNote(note: string): SaleNoteEmphasis {
  const text = note.normalize('NFC')
  const folded = foldText(text)
  const runs: SaleNoteRun[] = []
  const designatedPercents = new Set<number>()
  let emphasizeName = false
  const push = (start: number, end: number, bold: boolean) => {
    if (start >= end) return
    const last = runs.at(-1)
    if (last?.bold === bold) last.text += text.slice(start, end)
    else runs.push({ text: text.slice(start, end), bold })
  }
  for (const [start, end] of clauseRanges(folded)) {
    const clause = folded.slice(start, end)
    if (NOT_SHIPPED.test(clause)) {
      push(start, end, false)
      continue
    }
    const hasDate = clause.search(DATE_VALUE) >= 0 || clause.search(BARE_PERCENT) >= 0
    exactPercents(clause).forEach((percent) => designatedPercents.add(percent))
    if (SPECIAL_HANDLING.test(clause) || hasDate) {
      const contentEnd = start + clause.replace(/[\s,;.]+$/, '').length
      emphasizeName = true
      push(start, contentEnd, true)
      push(contentEnd, end, false)
      continue
    }
    const quantity = FIFO_QUANTITY.exec(clause)
    if (!quantity) {
      push(start, end, false)
      continue
    }
    const quantityEnd = start + quantity.index + quantity[0].length
    const quantityStart = quantityEnd - quantity[1].length
    push(start, quantityStart, false)
    push(quantityStart, quantityEnd, true)
    push(quantityEnd, end, false)
  }
  return { runs, emphasizeName, designatedPercents: [...designatedPercents] }
}
