import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEnv } from '../src/env.js';

test('buildEnv parses booleans and cors origins safely', () => {
  const env = buildEnv({
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/all_avenues',
    CORS_ORIGIN: 'http://localhost:5173, https://app.example.com ',
    TRUST_PROXY: 'true',
    SESSION_COOKIE_NAME: 'workspace_session',
    AUTH_SESSION_DAYS: '7',
    UPLOADS_DIR: 'uploads',
    MAX_UPLOAD_SIZE_MB: '15',
  });

  assert.equal(env.TRUST_PROXY, true);
  assert.equal(env.SESSION_COOKIE_NAME, 'workspace_session');
  assert.deepEqual(env.allowedCorsOrigins, ['http://localhost:5173', 'https://app.example.com']);
  assert.equal(env.maxUploadSizeBytes, 15 * 1024 * 1024);
});
