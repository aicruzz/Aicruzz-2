import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import * as schema from '../db/schema';
import { env } from './env';

declare global {
  // eslint-disable-next-line no-var
  var __pgClient: Sql | undefined;
  // eslint-disable-next-line no-var
  var __db: PostgresJsDatabase<typeof schema> | undefined;
}

const client: Sql =
  global.__pgClient ??
  postgres(env.DATABASE_URL, {
    max: env.isDev ? 5 : 20,
    idle_timeout: 30,
    connect_timeout: 10,
  });

if (env.isDev) {
  global.__pgClient = client;
}

export const db: PostgresJsDatabase<typeof schema> =
  global.__db ?? drizzle(client, { schema, logger: false });

if (env.isDev) {
  global.__db = db;
}

export { schema };

export async function connectDatabase(): Promise<void> {
  try {
    await client`SELECT 1`;
    console.log('✅ Database connected');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
}

export async function disconnectDatabase(): Promise<void> {
  await client.end({ timeout: 5 });
  console.log('🔌 Database disconnected');
}
