const PDF_EXPORT_ROOT_CLASS = 'generated-pdf-export-root';

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
        attachmentCard.remove();
        return;
      }

      image.style.display = 'none';
    }),
  );

  root.querySelectorAll('.attachment-page').forEach((page) => {
    if (page instanceof HTMLElement && !page.querySelector('.attachment-card')) {
      page.remove();
    }
  });
};

export async function buildGeneratedPdfBlob({ html }: { html: string }) {
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

    return pdf.output('blob');
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
