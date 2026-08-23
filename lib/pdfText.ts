// Client-side PDF text extraction (used for the OpenSolar import).
export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  // worker copied into /public at build (matches the pinned pdfjs-dist version)
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  let out = '';
  const max = Math.min(doc.numPages, 20); // the specs live in the first pages
  for (let i = 1; i <= max; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    out +=
      content.items.map((it: any) => (typeof it.str === 'string' ? it.str : '')).join(' ') + '\n';
    if (out.length > 20000) break;
  }
  return out;
}
