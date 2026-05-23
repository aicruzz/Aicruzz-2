import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Strip common SQL/NoSQL injection patterns from query params.
 * Defense-in-depth: Prisma already parameterizes queries, but this
 * blocks obvious probing attempts at the request edge.
 */
export function sanitizeQuery(req: Request, _res: Response, next: NextFunction): void {
  const dangerousKeys = ['$where', '$ne', '$gt', '$lt', '$regex', '$expr'];

  const sanitizeObject = (obj: Record<string, unknown>): void => {
    for (const key of Object.keys(obj)) {
      if (dangerousKeys.includes(key)) {
        logger.warn(`Stripped dangerous key from query: ${key}`, { ip: req.ip });
        delete obj[key];
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitizeObject(obj[key] as Record<string, unknown>);
      }
    }
  };

  if (req.query && typeof req.query === 'object') {
    sanitizeObject(req.query as Record<string, unknown>);
  }

  next();
}

/**
 * Adds production security headers beyond what Helmet provides.
 */
export function additionalSecurityHeaders(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Prevent referrer leakage when navigating to external sites
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Disable browser feature policies we don't use
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(self), camera=(self), payment=()',
  );

  // Prevent caching of authenticated responses
  if (res.req.headers.authorization) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  }

  next();
}

/**
 * Block requests with suspiciously long URLs / headers — common DDoS pattern.
 */
export function requestSizeGuard(req: Request, res: Response, next: NextFunction): void {
  const MAX_URL = 4_096; // 4 KB
  const MAX_HEADER_BYTES = 16_384; // 16 KB total headers

  if (req.url.length > MAX_URL) {
    res.status(414).json({ success: false, message: 'URL too long' });
    return;
  }

  let totalHeaderBytes = 0;
  for (const [k, v] of Object.entries(req.headers)) {
    totalHeaderBytes += k.length + (typeof v === 'string' ? v.length : 0);
  }
  if (totalHeaderBytes > MAX_HEADER_BYTES) {
    res.status(431).json({ success: false, message: 'Request headers too large' });
    return;
  }

  next();
}
