declare module 'pdfmake/build/pdfmake' {
  import type * as PdfMake from 'pdfmake'
  const pdfMake: typeof PdfMake
  export default pdfMake
}

declare module 'pdfmake/build/fonts/Roboto' {
  import type { TFontContainer } from 'pdfmake/interfaces'
  const fontContainer: TFontContainer
  export default fontContainer
}
