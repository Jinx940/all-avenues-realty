import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestJson } from './api';

const okJsonResponse = () =>
  new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });

describe('api requests', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adds a JSON content type for string request bodies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJsonResponse());
    vi.stubGlobal('fetch', fetchMock);

    await requestJson<{ ok: boolean }>('/demo', {
      method: 'POST',
      body: JSON.stringify({ name: 'Saranac' }),
    });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  });

  it('does not set a content type for FormData uploads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJsonResponse());
    vi.stubGlobal('fetch', fetchMock);

    await requestJson<{ ok: boolean }>('/upload', {
      method: 'POST',
      body: new FormData(),
    });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
  });
});
