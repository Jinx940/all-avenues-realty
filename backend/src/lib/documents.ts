import { randomBytes } from 'node:crypto';

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
