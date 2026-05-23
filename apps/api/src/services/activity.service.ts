import { and, desc, eq, gte, ilike, lte, sql, type SQL } from 'drizzle-orm';
import { db } from '../config/database';
import { activityLogs, logSeverityEnum } from '../db/schema';
import { logger } from '../utils/logger';

export type LogSeverity = (typeof logSeverityEnum.enumValues)[number];

export interface LogActivityInput {
  userId?: string;
  action: string;
  module?: string;
  severity?: LogSeverity;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    await db.insert(activityLogs).values({
      userId: input.userId,
      action: input.action,
      module: input.module,
      severity: input.severity ?? 'INFO',
      details: input.details,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  } catch (err) {
    // Never let logging failures crash the main flow
    logger.error('Failed to write activity log:', err);
  }
}

export async function getActivityLogs(
  filters: {
    userId?: string;
    action?: string;
    module?: string;
    severity?: LogSeverity;
    from?: Date;
    to?: Date;
  },
  page = 1,
  limit = 50,
) {
  const conditions: SQL[] = [];
  if (filters.userId) conditions.push(eq(activityLogs.userId, filters.userId));
  if (filters.action) conditions.push(ilike(activityLogs.action, `%${filters.action}%`));
  if (filters.module) conditions.push(eq(activityLogs.module, filters.module));
  if (filters.severity) conditions.push(eq(activityLogs.severity, filters.severity));
  if (filters.from) conditions.push(gte(activityLogs.createdAt, filters.from));
  if (filters.to) conditions.push(lte(activityLogs.createdAt, filters.to));

  const whereExpr = conditions.length > 0 ? and(...conditions) : undefined;

  const [logs, totalRows] = await Promise.all([
    db.query.activityLogs.findMany({
      where: whereExpr,
      with: {
        user: { columns: { id: true, email: true, name: true } },
      },
      orderBy: (t, { desc: d }) => d(t.createdAt),
      limit,
      offset: (page - 1) * limit,
    }),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(activityLogs)
      .where(whereExpr ?? sql`true`),
  ]);

  const total = totalRows[0]?.count ?? 0;

  return { logs, total, page, limit, totalPages: Math.ceil(total / limit) };
}
