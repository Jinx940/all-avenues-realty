const PDF_EXPORT_ROOT_CLASS = 'generated-pdf-export-root';
const A4_PAGE_WIDTH_POINTS = 595.28;
const A4_PAGE_HEIGHT_POINTS = 841.89;
const RECEIPT_PAGE_MARGIN_POINTS = 36;
const RECEIPT_IMAGE_GAP_POINTS = 18;
const RECEIPT_IMAGES_PER_PAGE = 2;
const MAX_RECEIPT_IMAGE_WIDTH = 2000;
const MAX_RECEIPT_IMAGE_HEIGHT = 2600;

export const generatedPdfPageRasterSettings = (
  isAzePage: boolean,
  hasAttachmentImages: boolean,
) => {
  if (isAzePage && !hasAttachmentImages) {
    return { scale: 4, imageFormat: 'PNG' as const, mimeType: 'image/png', quality: undefined };
  }

  if (hasAttachmentImages) {
    return { scale: 2, imageFormat: 'JPEG' as const, mimeType: 'image/jpeg', quality: 0.86 };
  }

  return { scale: 2, imageFormat: 'JPEG' as const, mimeType: 'image/jpeg', quality: 0.94 };
};

export const fitReceiptImageDimensions = (width: number, height: number) => {
  const scale = Math.min(1, MAX_RECEIPT_IMAGE_WIDTH / width, MAX_RECEIPT_IMAGE_HEIGHT / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

type ReceiptImageSize = {
  width: number;
  height: number;
};

export type ReceiptImagePlacement = ReceiptImageSize & {
  x: number;
  y: number;
};

export const receiptImagePlacementsForPage = (
  imageSizes: ReceiptImageSize[],
): ReceiptImagePlacement[] => {
  const pageImageSizes = imageSizes.slice(0, RECEIPT_IMAGES_PER_PAGE);
  if (!pageImageSizes.length) return [];

  const usableWidth = A4_PAGE_WIDTH_POINTS - RECEIPT_PAGE_MARGIN_POINTS * 2;
  const usableHeight = A4_PAGE_HEIGHT_POINTS - RECEIPT_PAGE_MARGIN_POINTS * 2;
  const slotWidth = (usableWidth - RECEIPT_IMAGE_GAP_POINTS) / RECEIPT_IMAGES_PER_PAGE;
  const occupiedWidth =
    slotWidth * pageImageSizes.length +
    RECEIPT_IMAGE_GAP_POINTS * Math.max(0, pageImageSizes.length - 1);
  const firstSlotX = (A4_PAGE_WIDTH_POINTS - occupiedWidth) / 2;

  return pageImageSizes.map((imageSize, index) => {
    const scale = Math.min(slotWidth / imageSize.width, usableHeight / imageSize.height);
    const width = imageSize.width * scale;
    const height = imageSize.height * scale;
    const slotX = firstSlotX + index * (slotWidth + RECEIPT_IMAGE_GAP_POINTS);

    return {
      x: slotX + (slotWidth - width) / 2,
      y: (A4_PAGE_HEIGHT_POINTS - height) / 2,
      width,
      height,
    };
  });
};

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

  const exportShadow = exportShell.attachShadow({ mode: 'open' });
  const exportRoot = document.createElement('div');
  exportRoot.className = PDF_EXPORT_ROOT_CLASS;

  if (styleContent) {
    const styleNode = document.createElement('style');
    styleNode.textContent = styleContent;
    exportShadow.appendChild(styleNode);
  }

  const bodyContainer = document.createElement('div');
  bodyContainer.innerHTML = parsed.body.innerHTML;

  while (bodyContainer.firstChild) {
    exportRoot.appendChild(bodyContainer.firstChild);
  }

  exportShadow.appendChild(exportRoot);
  document.body.appendChild(exportShell);

  return { exportShell, exportRoot };
};

const waitForExportLayout = async (root: HTMLElement) => {
  const view = root.ownerDocument.defaultView ?? window;

  await new Promise<void>((resolve) => {
    view.requestAnimationFrame(() => {
      view.requestAnimationFrame(() => resolve());
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
  appendix.blob.type.toLowerCase().includes('pdf') ||
  appendix.fileName.split(/[?#]/)[0]?.toLowerCase().endsWith('.pdf');
const hasPdfSignature = (bytes: Uint8Array) =>
  bytes[0] === 0x25 &&
  bytes[1] === 0x50 &&
  bytes[2] === 0x44 &&
  bytes[3] === 0x46 &&
  bytes[4] === 0x2d;

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
  const fittedDimensions = fitReceiptImageDimensions(width, height);
  canvas.width = fittedDimensions.width;
  canvas.height = fittedDimensions.height;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not prepare receipt image.');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, fittedDimensions.width, fittedDimensions.height);
  context.drawImage(image, 0, 0, fittedDimensions.width, fittedDimensions.height);

  const jpegBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((convertedBlob) => {
      if (convertedBlob) {
        resolve(convertedBlob);
        return;
      }

      reject(new Error('Could not convert receipt image.'));
    }, 'image/jpeg', 0.86);
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

  const { PDFDocument } = await import('pdf-lib');
  const pdfDocument = await PDFDocument.load(await invoicePdfBlob.arrayBuffer());
  let hasAddedReceiptAppendix = false;
  let receiptImageBatch: Array<{
    image: Awaited<ReturnType<typeof pdfDocument.embedJpg>>;
  }> = [];

  const flushReceiptImageBatch = () => {
    if (!receiptImageBatch.length) return;

    const page = pdfDocument.addPage([A4_PAGE_WIDTH_POINTS, A4_PAGE_HEIGHT_POINTS]);
    const placements = receiptImagePlacementsForPage(
      receiptImageBatch.map(({ image }) => ({ width: image.width, height: image.height })),
    );

    receiptImageBatch.forEach(({ image }, index) => {
      const placement = placements[index];
      if (!placement) return;

      page.drawImage(image, placement);
    });

    receiptImageBatch = [];
    hasAddedReceiptAppendix = true;
  };

  for (const appendix of receiptAppendices) {
    try {
      const appendixBytes = new Uint8Array(await appendix.blob.arrayBuffer());
      if (isPdfReceiptAppendix(appendix) || hasPdfSignature(appendixBytes)) {
        flushReceiptImageBatch();
        const receiptDocument = await PDFDocument.load(appendixBytes, {
          ignoreEncryption: true,
        });
        const receiptPages = await pdfDocument.copyPages(
          receiptDocument,
          receiptDocument.getPageIndices(),
        );

        if (!receiptPages.length) {
          continue;
        }

        receiptPages.forEach((page) => pdfDocument.addPage(page));
        hasAddedReceiptAppendix = true;
        continue;
      }

      const receiptImage = await pdfDocument.embedJpg(await imageBlobToJpegBytes(appendix.blob));
      receiptImageBatch.push({ image: receiptImage });

      if (receiptImageBatch.length === RECEIPT_IMAGES_PER_PAGE) {
        flushReceiptImageBatch();
      }
    } catch {
      throw new Error(`Could not append receipt "${appendix.fileName}" to the PDF.`);
    }
  }

  flushReceiptImageBatch();

  if (!hasAddedReceiptAppendix) {
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
    await waitForExportLayout(exportRoot);
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
      const rasterSettings = generatedPdfPageRasterSettings(
        page.classList.contains('aze-invoice-page'),
        Boolean(page.querySelector('.attachment-card img')),
      );
      const canvas = await html2canvas(page, {
        scale: rasterSettings.scale,
        useCORS: true,
        backgroundColor: '#d9d9d9',
        logging: false,
        scrollX: 0,
        scrollY: 0,
      });

      const imageData = canvas.toDataURL(rasterSettings.mimeType, rasterSettings.quality);
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

      pdf.addImage(
        imageData,
        rasterSettings.imageFormat,
        offsetX,
        offsetY,
        renderWidth,
        renderHeight,
        undefined,
        'FAST',
      );
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
