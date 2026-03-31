import type { NextFunction, Request, Response } from 'express';
import type { AuthUser } from './auth.js';

export type Handler = (
  request: Request,
  response: Response,
  next: NextFunction,
) => Promise<void> | void;

export type AuthenticatedRequest = Request & { auth?: AuthUser };

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
