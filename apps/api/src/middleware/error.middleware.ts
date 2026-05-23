import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import { CLIENT_GENERIC_TRY_AGAIN } from '../constants/client-safe-messages';

export type AppErrorOptions = {
  isOperational?: boolean;
  /** When set, HTTP responses use this instead of `message` (which may hold internal detail for logs). */
  clientSafeMessage?: string;
};

export type AppErrorInit = boolean | AppErrorOptions;

function normalizeInit(init?: AppErrorInit): AppErrorOptions {
  if (init === undefined || typeof init === 'boolean') {
    return { isOperational: init !== false };
  }
  return { isOperational: init.isOperational ?? true, clientSafeMessage: init.clientSafeMessage };
}

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  clientSafeMessage?: string;

  constructor(message: string, statusCode = 400, init: AppErrorInit = true) {
    super(message);
    this.statusCode = statusCode;
    const opts = normalizeInit(init);
    this.isOperational = opts.isOperational ?? true;
    this.clientSafeMessage = opts.clientSafeMessage;
    Error.captureStackTrace(this, this.constructor);
  }

  /** Message safe to send in JSON to browsers / public API clients. */
  responseMessage(): string {
    if (this.clientSafeMessage) return this.clientSafeMessage;
    // 500 = unexpected server fault — hide implementation detail in production.
    if (env.isProd && this.statusCode === 500) return CLIENT_GENERIC_TRY_AGAIN;
    return this.message;
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 422);
  }
}

export class InsufficientCreditsError extends AppError {
  constructor(required: number, available: number) {
    super(
      `Insufficient credits. Required: ${required.toFixed(2)}, Available: ${available.toFixed(2)}`,
      402,
    );
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable') {
    super(message, 503);
  }
}

// DB connectivity errors — transient infrastructure failures from postgres-js / node:net.
// Surfaced as 503 so the web client doesn't treat them as auth failures.
const DB_CONN_ERRORS = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'CONNECT_TIMEOUT',
  'CONNECTION_ENDED',
  'CONNECTION_DESTROYED',
  'CONNECTION_CLOSED',
  'CONNECTION_RESET',
]);

export function isDbConnectivityError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code;
  return typeof code === 'string' && DB_CONN_ERRORS.has(code);
}

// Back-compat alias — callers still import this name.
export const isPrismaConnectivityError = isDbConnectivityError;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.responseMessage(),
      ...(env.isDev && { stack: err.stack }),
    });
    return;
  }

  // Postgres unique constraint violation (SQLSTATE 23505)
  if ((err as { code?: string }).code === '23505') {
    const detail = (err as { detail?: string }).detail;
    const fieldMatch = detail?.match(/Key \(([^)]+)\)/);
    const field = fieldMatch?.[1] ?? 'field';
    res.status(409).json({
      success: false,
      message: `A record with this ${field} already exists`,
    });
    return;
  }

  // Database unreachable / transient connectivity — surface as 503 so clients
  // (and the web auth interceptor) don't mistake it for an auth failure.
  if (isDbConnectivityError(err)) {
    logger.error('Database connectivity error:', {
      code: (err as { code?: string }).code,
      url: req.url,
      method: req.method,
    });
    res.status(503).json({
      success: false,
      message: 'Service temporarily unavailable. Please try again.',
    });
    return;
  }

  logger.error('Unhandled error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
  });

  res.status(500).json({
    success: false,
    message: env.isProd ? CLIENT_GENERIC_TRY_AGAIN : err.message,
    ...(env.isDev && { stack: err.stack }),
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
}
