import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDocumentResponse,
  buildPdfPreviewResponse,
  parseBase64PdfContent,
  safeContentDispositionFileName,
  sanitizeGeneratedDocumentHtml,
} from '../src/lib/documents.js';

test('sanitizeGeneratedDocumentHtml removes scripts and inline handlers', () => {
  const html = `
    <html>
      <body onload="alert('xss')">
        <img src="javascript:alert('xss')" onerror="alert('xss')" />
        <script>alert('xss')</script>
        <p>Safe content</p>
      </body>
    </html>
  `;

  const sanitized = sanitizeGeneratedDocumentHtml(html);

  assert.match(sanitized, /Safe content/);
  assert.doesNotMatch(sanitized, /<script/i);
  assert.doesNotMatch(sanitized, /onload=/i);
  assert.doesNotMatch(sanitized, /onerror=/i);
  assert.doesNotMatch(sanitized, /javascript:/i);
});

test('buildDocumentResponse injects a print nonce only in print mode', () => {
  const printResponse = buildDocumentResponse('<html><body><p>Invoice</p></body></html>', true);
  const normalResponse = buildDocumentResponse('<html><body><p>Invoice</p></body></html>', false);

  assert.match(printResponse.html, /window\.print/);
  assert.match(printResponse.headers['Content-Security-Policy'], /script-src 'nonce-/);
  assert.equal(normalResponse.headers['Content-Security-Policy'].includes("script-src 'none'"), true);
});

test('buildPdfPreviewResponse returns an html wrapper with a nonce and same-origin fetch', () => {
  const preview = buildPdfPreviewResponse('/api/job-files/file-1?raw=1', 'receipt.pdf');

  assert.match(preview.html, /Loading PDF preview/);
  assert.match(preview.html, /fetch\(sourceUrl, \{ credentials: 'include' \}\)/);
  assert.match(preview.headers['Content-Security-Policy'], /script-src 'nonce-/);
  assert.match(preview.headers['Content-Security-Policy'], /frame-src 'self' blob:/);
});

test('safeContentDispositionFileName strips header-breaking characters', () => {
  assert.equal(
    safeContentDispositionFileName('invoice"\r\nX-Bad: yes.pdf'),
    'invoiceX-Bad: yes.pdf',
  );
  assert.equal(safeContentDispositionFileName('../invoice.pdf'), '..-invoice.pdf');
});

test('parseBase64PdfContent accepts only canonical PDF payloads', () => {
  const pdfBase64 = Buffer.from('%PDF-1.4\n%%EOF').toString('base64');
  const parsed = parseBase64PdfContent(pdfBase64);

  assert.equal(parsed?.base64, pdfBase64);
  assert.match(parsed?.buffer.toString('utf8') ?? '', /^%PDF-/);
  assert.equal(parseBase64PdfContent(Buffer.from('not a pdf').toString('base64')), null);
  assert.equal(parseBase64PdfContent('not-base64'), null);
});
