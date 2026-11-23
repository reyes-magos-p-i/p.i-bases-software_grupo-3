import pdfMake from 'pdfmake/build/pdfmake'
import helvetica from 'pdfmake/build/standard-fonts/Helvetica'
import currencyFont from '@/assets/fonts/NotoSans-Regular.ttf?url'
import { salesReportDocument } from '@/utils/sales-report-document'
import type { SalesReportRequest, SalesReportResponse } from '@/types/sales-report'

pdfMake.addFontContainer(helvetica)
let fontsReady: Promise<void> | undefined

async function loadCurrencyFont(): Promise<void> {
  const response = await fetch(currencyFont)
  if (!response.ok) throw new Error('Currency font could not be loaded')
  const bytes = new Uint8Array(await response.arrayBuffer())
  const chunks: string[] = []
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    chunks.push(String.fromCodePoint(...bytes.subarray(offset, offset + 32768)))
  }
  pdfMake.addVirtualFileSystem({ 'NotoSans-Regular.ttf': btoa(chunks.join('')) })
  pdfMake.addFonts({
    NotoSans: {
      normal: 'NotoSans-Regular.ttf',
      bold: 'NotoSans-Regular.ttf',
      italics: 'NotoSans-Regular.ttf',
      bolditalics: 'NotoSans-Regular.ttf',
    },
  })
}
const worker = self as unknown as Pick<Worker, 'onmessage' | 'postMessage'>
worker.onmessage = async (event: MessageEvent<SalesReportRequest>) => {
  try {
    fontsReady ??= loadCurrencyFont()
    await fontsReady
    const bytes = await pdfMake.createPdf(salesReportDocument(event.data)).getBuffer()
    const buffer = Uint8Array.from(bytes).buffer
    worker.postMessage({ ok: true, buffer } satisfies SalesReportResponse, [buffer])
  } catch {
    worker.postMessage({ ok: false } satisfies SalesReportResponse)
  }
}
