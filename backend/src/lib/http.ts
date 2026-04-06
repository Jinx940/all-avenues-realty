import type { NextFunction, Request, Response } from 'express';
import type { AuthUser } from './auth.js';

export type Handler = (
  request: Request,
  response: Response,
  next: NextFunction,
) => Promise<void> | void;

export type AuthenticatedRequest = Request & { auth?: AuthUser };

export class HttpError extends Error {
  status: number;

  details?: Record<string, unknown>;

  constructor(status: number, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

export const asyncRoute = (handler: Handler) => async (
  request: Request,
  response: Response,
  next: NextFunction,
) => {
  try {
    await handler(request, response, next);
  } catch (error) {
    next(error);
  }
};

export const setNoStore = (response: Response) => {
  response.setHeader('Cache-Control', 'no-store');
};
