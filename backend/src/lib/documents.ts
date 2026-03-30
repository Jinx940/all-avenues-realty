import { randomBytes } from 'node:crypto';

const escapeHtmlText = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const stripDangerousTags = (html: string) =>
  html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<(object|embed|base|meta|link)\b[^>]*>/gi, '');

const stripDangerousAttributes = (html: string) =>
  html
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');

export const sanitizeGeneratedDocumentHtml = (html: string) =>
  stripDangerousAttributes(stripDangerousTags(html)).trim();

export const buildGeneratedDocumentUrl = (documentId: string, autoPrint = false) =>
  `/api/generated-documents/${documentId}${autoPrint ? '?print=1' : ''}`;

export const buildJobFileUrl = (fileId: string) => `/api/job-files/${fileId}`;

export const buildPropertyCoverUrl = (propertyId: string) =>
  `/api/properties/${propertyId}/cover-image`;

const contentSecurityPolicy = (nonce?: string) =>
  [
    "default-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'",
    "img-src 'self' data: https:",
    "font-src 'self' data: https:",
    "style-src 'unsafe-inline'",
    nonce ? `script-src 'nonce-${nonce}'` : "script-src 'none'",
  ].join('; ');

export const buildDocumentResponse = (html: string, printMode: boolean) => {
  if (!printMode) {
    return {
      html,
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Security-Policy': contentSecurityPolicy(),
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
      },
    };
  }

  const nonce = randomBytes(16).toString('base64');
  const printScript = `
    <script nonce="${nonce}">
      window.addEventListener('load', () => {
        window.setTimeout(() => window.print(), 180);
      });
    </script>
  `;

  const printHtml = html.includes('</body>')
    ? html.replace('</body>', `${printScript}</body>`)
    : `${html}${printScript}`;

  return {
    html: printHtml,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': contentSecurityPolicy(nonce),
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  };
};

const pdfPreviewContentSecurityPolicy = (nonce: string) =>
  [
    "default-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'",
    "connect-src 'self'",
    "frame-src 'self' blob:",
    "img-src 'self' data: https:",
    "font-src 'self' data: https:",
    "style-src 'unsafe-inline'",
    `script-src 'nonce-${nonce}'`,
  ].join('; ');

export const buildPdfPreviewResponse = (pdfUrl: string, fileName: string) => {
  const nonce = randomBytes(16).toString('base64');
  const safeFileName = escapeHtmlText(fileName);
  const safePdfUrl = JSON.stringify(pdfUrl);

  return {
    html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeFileName}</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        background: linear-gradient(180deg, #f7fbff, #edf5fc);
        color: #32597f;
        font: 600 16px/1.4 system-ui, sans-serif;
      }
      .status, .error {
        display: grid;
        place-content: center;
        gap: 10px;
        padding: 32px;
        text-align: center;
      }
      .status strong, .error strong {
        font-size: 1.1rem;
        color: #294c6f;
      }
      .error { color: #6888a8; }
      .actions {
        display: inline-flex;
        gap: 10px;
        justify-content: center;
        flex-wrap: wrap;
      }
      a {
        color: #2f6f7a;
        text-decoration: none;
        padding: 10px 16px;
        border-radius: 999px;
        border: 1px solid rgba(145, 198, 235, 0.96);
        background: rgba(255, 255, 255, 0.94);
      }
      iframe {
        width: 100%;
        height: 100%;
        border: 0;
        background: white;
      }
      [hidden] { display: none !important; }
    </style>
  </head>
  <body>
    <div id="status" class="status">
      <strong>Loading PDF preview...</strong>
      <span>Please wait a moment.</span>
    </div>
    <div id="error" class="error" hidden>
      <strong>Could not load this PDF preview</strong>
      <span id="error-message">Use Open file or Download to inspect it.</span>
      <div class="actions">
        <a id="open-link" href="${escapeHtmlText(pdfUrl)}" target="_blank" rel="noreferrer">Open file</a>
      </div>
    </div>
    <iframe id="viewer" title="${safeFileName}" hidden></iframe>
    <script nonce="${nonce}">
      const sourceUrl = ${safePdfUrl};
      const status = document.getElementById('status');
      const error = document.getElementById('error');
      const errorMessage = document.getElementById('error-message');
      const viewer = document.getElementById('viewer');
      let objectUrl = null;

      const showError = (message) => {
        status.hidden = true;
        viewer.hidden = true;
        error.hidden = false;
        errorMessage.textContent = message;
      };

      window.addEventListener('beforeunload', () => {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
      });

      fetch(sourceUrl, { credentials: 'include' })
        .then((response) => {
          if (!response.ok) {
            throw new Error('Unable to load the saved PDF.');
          }
          return response.blob();
        })
        .then(async (blob) => {
          const pdfBlob =
            blob.type === 'application/pdf'
              ? blob
              : new Blob([await blob.arrayBuffer()], { type: 'application/pdf' });

          objectUrl = URL.createObjectURL(pdfBlob);
          viewer.src = objectUrl;
          status.hidden = true;
          error.hidden = true;
          viewer.hidden = false;
        })
        .catch(() => {
          showError('Use Open file or Download to inspect it on your device.');
        });
    </script>
  </body>
</html>`,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': pdfPreviewContentSecurityPolicy(nonce),
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  };
};
