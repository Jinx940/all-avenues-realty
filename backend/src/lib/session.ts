import type { CookieOptions, Request, Response } from 'express';

type SessionEnv = {
  AUTH_SESSION_DAYS: number;
  NODE_ENV: 'development' | 'test' | 'production';
  SESSION_COOKIE_NAME: string;
};

const sessionCookieOptions = (env: SessionEnv): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: env.NODE_ENV === 'production',
  path: '/',
  maxAge: env.AUTH_SESSION_DAYS * 24 * 60 * 60 * 1000,
});

export const parseCookieHeader = (headerValue: string | undefined) => {
  const cookies: Record<string, string> = {};

  String(headerValue ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex <= 0) {
        return;
      }

      const key = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      cookies[key] = decodeURIComponent(value);
    });

  return cookies;
};

export const sessionTokenFromRequest = (request: Request, cookieName: string) => {
  const cookies = parseCookieHeader(request.headers.cookie);
  const cookieToken = String(cookies[cookieName] ?? '').trim();
  if (cookieToken) {
    return cookieToken;
  }

  const header = String(request.headers.authorization ?? '').trim();
  if (!header.toLowerCase().startsWith('bearer ')) {
    return '';
  }

  return header.slice(7).trim();
};

export const setSessionCookie = (response: Response, env: SessionEnv, token: string) => {
  response.cookie(env.SESSION_COOKIE_NAME, token, sessionCookieOptions(env));
};

export const clearSessionCookie = (response: Response, env: SessionEnv) => {
  response.clearCookie(env.SESSION_COOKIE_NAME, {
    ...sessionCookieOptions(env),
    maxAge: undefined,
  });
};
