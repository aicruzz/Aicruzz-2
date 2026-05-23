import { sql } from 'drizzle-orm';
import { db } from '../config/database';
import { getRedis } from '../config/redis';
import { aiRouter } from '../services/ai-router.client';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  service: string;
  version: string;
  timestamp: string;
  env: string;
  checks: {
    database: { status: 'ok' | 'down'; latencyMs: number };
    redis: { status: 'ok' | 'down'; latencyMs: number };
    aiRouter: { status: 'ok' | 'down' | 'unknown' };
  };
}

async function checkDatabase(): Promise<{ status: 'ok' | 'down'; latencyMs: number }> {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch {
    return { status: 'down', latencyMs: Date.now() - start };
  }
}

async function checkRedis(): Promise<{ status: 'ok' | 'down'; latencyMs: number }> {
  const start = Date.now();
  try {
    const redis = getRedis();
    await redis.ping();
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch {
    return { status: 'down', latencyMs: Date.now() - start };
  }
}

async function checkAiRouter(): Promise<{ status: 'ok' | 'down' | 'unknown' }> {
  try {
    const result = (await aiRouter.getHealth()) as { status?: string };
    return { status: result.status === 'unreachable' ? 'down' : 'ok' };
  } catch {
    return { status: 'unknown' };
  }
}

export async function getDetailedHealth(env: string): Promise<HealthStatus> {
  const [database, redis, aiRouterStatus] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkAiRouter(),
  ]);

  const allOk = database.status === 'ok' && redis.status === 'ok';
  const status = !allOk ? 'down' : aiRouterStatus.status === 'down' ? 'degraded' : 'ok';

  return {
    status,
    service: 'AiCruzz API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    env,
    checks: { database, redis, aiRouter: aiRouterStatus },
  };
}
