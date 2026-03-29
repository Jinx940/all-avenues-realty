import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDocumentResponse,
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
