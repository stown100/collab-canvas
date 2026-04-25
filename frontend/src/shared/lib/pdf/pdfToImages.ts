// Renders each page of a PDF file to a high-resolution PNG File.
// Scale 2 = 192 DPI equivalent (crisp on retina / zoomed canvas).
// Lazy-loaded to avoid importing pdfjs-dist in the initial bundle.

let workerConfigured = false;

async function getPdfjs() {
  const pdfjs = await import('pdfjs-dist');
  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    workerConfigured = true;
  }
  return pdfjs;
}

export async function pdfToImageFiles(file: File, scale = 4): Promise<File[]> {
  const pdfjs = await getPdfjs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;

  const baseName = file.name.replace(/\.pdf$/i, '');
  const results: File[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    await page.render({ canvasContext: ctx, viewport }).promise;

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/png'),
    );
    if (!blob) continue;

    const suffix = pdf.numPages === 1 ? '' : `-p${pageNum}`;
    results.push(new File([blob], `${baseName}${suffix}.png`, { type: 'image/png' }));
  }

  return results;
}
