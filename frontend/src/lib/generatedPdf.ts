const PDF_EXPORT_ROOT_CLASS = 'generated-pdf-export-root';
const A4_PAGE_WIDTH_POINTS = 595.28;
const A4_PAGE_HEIGHT_POINTS = 841.89;
const RECEIPT_PAGE_MARGIN_POINTS = 36;

export type GeneratedPdfReceiptAppendix = {
  fileName: string;
  mimeType: string;
  blob: Blob;
};

const normalizePdfStyles = (css: string) =>
  css
    .replace(/html\s*,\s*body\s*\{/g, `.${PDF_EXPORT_ROOT_CLASS} {`)
    .replace(/body\s*,\s*html\s*\{/g, `.${PDF_EXPORT_ROOT_CLASS} {`)
    .replace(/body\s*\{/g, `.${PDF_EXPORT_ROOT_CLASS} {`)
    .replace(/html\s*\{/g, `.${PDF_EXPORT_ROOT_CLASS} {`);

const mountPdfExportRoot = (html: string) => {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(html, 'text/html');
  const styleContent = Array.from(parsed.querySelectorAll('style'))
    .map((styleNode) => normalizePdfStyles(styleNode.textContent ?? ''))
    .join('\n');

  const exportShell = document.createElement('div');
  Object.assign(exportShell.style, {
    position: 'fixed',
    left: '-250vw',
    top: '0',
    width: '210mm',
    minHeight: '297mm',
    background: '#ffffff',
    overflow: 'hidden',
    pointerEvents: 'none',
    zIndex: '-1',
  });

  const exportRoot = document.createElement('div');
  exportRoot.className = PDF_EXPORT_ROOT_CLASS;

  if (styleContent) {
    const styleNode = document.createElement('style');
    styleNode.textContent = styleContent;
    exportRoot.appendChild(styleNode);
  }

  const bodyContainer = document.createElement('div');
  bodyContainer.innerHTML = parsed.body.innerHTML;

  while (bodyContainer.firstChild) {
    exportRoot.appendChild(bodyContainer.firstChild);
  }

  exportShell.appendChild(exportRoot);
  document.body.appendChild(exportShell);

  return {
    exportShell,
    exportRoot,
  };
};

const waitForExportLayout = async () => {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
};

const waitForExportImages = async (root: HTMLElement) => {
  const images = Array.from(root.querySelectorAll('img'));

  await Promise.all(
    images.map(async (image) => {
      if (image.complete && image.naturalWidth > 0) {
        return;
      }

      await image.decode().catch(() => undefined);

      if (image.naturalWidth > 0) {
        return;
      }

      const attachmentCard = image.closest('.attachment-card');
      if (attachmentCard instanceof HTMLElement) {
        if (attachmentCard.closest('.attachment-grid--photos')) {
          attachmentCard.classList.add('attachment-card--empty');
          attachmentCard.innerHTML = `
            <div class="attachment-frame attachment-frame--empty"></div>
            <div class="attachment-caption attachment-caption--empty"></div>
          `;
          return;
        }

        attachmentCard.remove();
        return;
      }

      image.style.display = 'none';
    }),
  );

  root.querySelectorAll('.attachment-page').forEach((page) => {
    if (page instanceof HTMLElement && !page.querySelector('.attachment-card img')) {
      page.remove();
    }
  });
};

const isPdfReceiptAppendix = (appendix: GeneratedPdfReceiptAppendix) =>
  appendix.mimeType.toLowerCase().includes('pdf') ||
  appendix.fileName.split(/[?#]/)[0]?.toLowerCase().endsWith('.pdf');

const blobToObjectUrlImage = async (blob: Blob) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not load receipt image.'));
    };
    image.src = objectUrl;
  });

const imageBlobToJpegBytes = async (blob: Blob) => {
  const image = await blobToObjectUrlImage(blob);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;

  if (!width || !height) {
    throw new Error('Receipt image has invalid dimensions.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not prepare receipt image.');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const jpegBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((convertedBlob) => {
      if (convertedBlob) {
        resolve(convertedBlob);
        return;
      }

      reject(new Error('Could not convert receipt image.'));
    }, 'image/jpeg', 0.95);
  });

  return new Uint8Array(await jpegBlob.arrayBuffer());
};

const uint8ArrayToPdfBlob = (bytes: Uint8Array) => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);

  return new Blob([buffer], { type: 'application/pdf' });
};

const appendReceiptAppendices = async (
  invoicePdfBlob: Blob,
  receiptAppendices: GeneratedPdfReceiptAppendix[],
) => {
  if (!receiptAppendices.length) {
    return invoicePdfBlob;
  }

  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdfDocument = await PDFDocument.load(await invoicePdfBlob.arrayBuffer());
  let hasAddedReceiptsSeparator = false;

  const addReceiptsSeparator = async () => {
    if (hasAddedReceiptsSeparator) {
      return;
    }

    const page = pdfDocument.addPage([A4_PAGE_WIDTH_POINTS, A4_PAGE_HEIGHT_POINTS]);
    const titleFont = await pdfDocument.embedFont(StandardFonts.HelveticaBold);
    const labelFont = await pdfDocument.embedFont(StandardFonts.Helvetica);
    const centerX = page.getWidth() / 2;
    const centerY = page.getHeight() / 2;

    page.drawText('Attached Receipts', {
      x: centerX - 122,
      y: centerY + 16,
      size: 30,
      font: titleFont,
      color: rgb(0.07, 0.07, 0.07),
    });
    page.drawLine({
      start: { x: centerX - 112, y: centerY - 2 },
      end: { x: centerX + 112, y: centerY - 2 },
      thickness: 1.5,
      color: rgb(1, 0.36, 0.36),
    });
    page.drawText('Supporting receipt pages are attached after this page.', {
      x: centerX - 132,
      y: centerY - 28,
      size: 11,
      font: labelFont,
      color: rgb(0.25, 0.25, 0.25),
    });

    hasAddedReceiptsSeparator = true;
  };

  for (const appendix of receiptAppendices) {
    try {
      if (isPdfReceiptAppendix(appendix)) {
        const receiptDocument = await PDFDocument.load(await appendix.blob.arrayBuffer(), {
          ignoreEncryption: true,
        });
        const receiptPages = await pdfDocument.copyPages(
          receiptDocument,
          receiptDocument.getPageIndices(),
        );

        if (!receiptPages.length) {
          continue;
        }

        await addReceiptsSeparator();
        receiptPages.forEach((page) => pdfDocument.addPage(page));
        continue;
      }

      const receiptImage = await pdfDocument.embedJpg(await imageBlobToJpegBytes(appendix.blob));
      await addReceiptsSeparator();
      const page = pdfDocument.addPage([A4_PAGE_WIDTH_POINTS, A4_PAGE_HEIGHT_POINTS]);
      const maxWidth = page.getWidth() - RECEIPT_PAGE_MARGIN_POINTS * 2;
      const maxHeight = page.getHeight() - RECEIPT_PAGE_MARGIN_POINTS * 2;
      const scale = Math.min(maxWidth / receiptImage.width, maxHeight / receiptImage.height);
      const renderWidth = receiptImage.width * scale;
      const renderHeight = receiptImage.height * scale;

      page.drawImage(receiptImage, {
        x: (page.getWidth() - renderWidth) / 2,
        y: (page.getHeight() - renderHeight) / 2,
        width: renderWidth,
        height: renderHeight,
      });
    } catch {
      continue;
    }
  }

  if (!hasAddedReceiptsSeparator) {
    return invoicePdfBlob;
  }

  return uint8ArrayToPdfBlob(await pdfDocument.save());
};

export async function buildGeneratedPdfBlob({
  html,
  receiptAppendices = [],
}: {
  html: string;
  receiptAppendices?: GeneratedPdfReceiptAppendix[];
}) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);
  const { exportShell, exportRoot } = mountPdfExportRoot(html);

  try {
    await waitForExportLayout();
    await waitForExportImages(exportRoot);
    const pageElements = Array.from(exportRoot.querySelectorAll<HTMLElement>('.page'));
    const pages = pageElements.length ? pageElements : [exportRoot];
    const pdf = new jsPDF({
      unit: 'mm',
      format: 'a4',
      orientation: 'portrait',
      compress: true,
    });
    const pdfPageWidth = pdf.internal.pageSize.getWidth();
    const pdfPageHeight = pdf.internal.pageSize.getHeight();
    const pdfPageRatio = pdfPageWidth / pdfPageHeight;

    for (const [index, page] of pages.entries()) {
      const canvas = await html2canvas(page, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#d9d9d9',
        logging: false,
        scrollX: 0,
        scrollY: 0,
      });

      const imageData = canvas.toDataURL('image/jpeg', 0.98);
      const canvasRatio = canvas.width / canvas.height;
      const shouldFillA4 =
        Math.abs(canvasRatio - pdfPageRatio) <= 0.02 &&
        page.classList.contains('page');
      let renderWidth = pdfPageWidth;
      let renderHeight = pdfPageHeight;
      let offsetX = 0;
      let offsetY = 0;

      if (!shouldFillA4) {
        renderHeight = renderWidth / canvasRatio;

        if (renderHeight > pdfPageHeight) {
          renderHeight = pdfPageHeight;
          renderWidth = renderHeight * canvasRatio;
        }

        offsetX = (pdfPageWidth - renderWidth) / 2;
        offsetY = (pdfPageHeight - renderHeight) / 2;
      }

      if (index > 0) {
        pdf.addPage('a4', 'portrait');
      }

      pdf.addImage(imageData, 'JPEG', offsetX, offsetY, renderWidth, renderHeight, undefined, 'FAST');
    }

    return await appendReceiptAppendices(pdf.output('blob'), receiptAppendices);
  } finally {
    exportShell.remove();
  }
}

export const downloadPdfBlob = (pdfBlob: Blob, fileName: string) => {
  const url = URL.createObjectURL(pdfBlob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
};
