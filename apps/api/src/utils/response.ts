import { Response } from 'express';

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  errors?: Record<string, string[]>;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  message = 'Success',
  statusCode = 200,
  meta?: ApiResponse['meta'],
): void {
  const response: ApiResponse<T> = { success: true, message, data };
  if (meta) response.meta = meta;
  res.status(statusCode).json(response);
}

export function sendCreated<T>(res: Response, data: T, message = 'Created'): void {
  sendSuccess(res, data, message, 201);
}

export function sendError(
  res: Response,
  message: string,
  statusCode = 400,
  errors?: Record<string, string[]>,
): void {
  const response: ApiResponse = { success: false, message };
  if (errors) response.errors = errors;
  res.status(statusCode).json(response);
}

export function sendUnauthorized(res: Response, message = 'Unauthorized'): void {
  sendError(res, message, 401);
}

export function sendForbidden(res: Response, message = 'Forbidden'): void {
  sendError(res, message, 403);
}

export function sendNotFound(res: Response, message = 'Not found'): void {
  sendError(res, message, 404);
}

export function sendServerError(res: Response, message = 'Internal server error'): void {
  sendError(res, message, 500);
}
