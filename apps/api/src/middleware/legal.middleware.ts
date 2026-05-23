import { Request, Response, NextFunction } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../config/database';
import { users, legalConsents } from '../db/schema';
import { sendForbidden } from '../utils/response';

/**
 * requireLegalConsent(module)
 *
 * Verifies the authenticated user has accepted the legal terms for the
 * specified module before the request is allowed to proceed.
 * Always run AFTER `authenticate`.
 */
export function requireLegalConsent(module: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) {
      sendForbidden(res, 'Authentication required');
      return;
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { legalConsented: true },
    });

    if (!user?.legalConsented) {
      res.status(403).json({
        success: false,
        message: 'Legal consent required',
        code: 'LEGAL_CONSENT_REQUIRED',
        module,
        requiresConsent: true,
      });
      return;
    }

    next();
  };
}
/**
 * POST /api/legal/consent
 * Body: { module: string }
 * Records the user's legal consent for a module.
 */
export async function recordLegalConsent(req: Request, res: Response): Promise<void> {
  const { module } = req.body as { module: string };
  const userId = req.user!.userId;

  if (!module || typeof module !== 'string') {
    res.status(400).json({ success: false, message: 'module is required' });
    return;
  }

  await db
    .insert(legalConsents)
    .values({
      userId,
      module,
      version: '1.0',
      ipAddress: req.ip ?? undefined,
      userAgent: req.headers['user-agent'],
    })
    .onConflictDoUpdate({
      target: [legalConsents.userId, legalConsents.module],
      set: {
        version: '1.0',
        acceptedAt: new Date(),
        ipAddress: req.ip ?? undefined,
      },
    });

  res.json({ success: true, message: `Legal consent recorded for ${module}` });
}

/**
 * GET /api/legal/consents
 * Returns all legal consents for the current user.
 */
export async function getUserConsents(req: Request, res: Response): Promise<void> {
  const consents = await db
    .select({
      module: legalConsents.module,
      version: legalConsents.version,
      acceptedAt: legalConsents.acceptedAt,
    })
    .from(legalConsents)
    .where(eq(legalConsents.userId, req.user!.userId));

  res.json({ success: true, data: consents });
}
