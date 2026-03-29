import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request } from 'express';
import { parseCookieHeader, sessionTokenFromRequest } from '../src/lib/session.js';

test('parseCookieHeader decodes cookie values', () => {
  assert.deepEqual(parseCookieHeader('foo=bar; token=a%20b'), {
    foo: 'bar',
    token: 'a b',
  });
});

test('sessionTokenFromRequest prefers the session cookie over authorization headers', () => {
  const request = {
    headers: {
      cookie: 'workspace_session=cookie-token',
      authorization: 'Bearer header-token',
    },
  } as Request;

  assert.equal(sessionTokenFromRequest(request, 'workspace_session'), 'cookie-token');
});

test('sessionTokenFromRequest falls back to bearer auth when no cookie exists', () => {
  const request = {
    headers: {
      authorization: 'Bearer header-token',
    },
  } as Request;

  assert.equal(sessionTokenFromRequest(request, 'workspace_session'), 'header-token');
});
