import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, disconnectDatabase } from '../config/database';
import { users, wallets, transactions, legalConsents } from './schema';

async function upsertUser(opts: {
  email: string;
  password: string;
  name: string;
  role: 'USER' | 'ADMIN';
  walletSeed: { credits: number; pendingRestore: number; expiresAt?: Date; lastFundedAt?: Date };
}) {
  const existing = await db.query.users.findFirst({
    where: eq(users.email, opts.email),
    columns: { id: true },
  });
  if (existing) return existing.id;

  return db.transaction(async (tx) => {
    const passwordHash = await bcrypt.hash(opts.password, 12);
    const [u] = await tx
      .insert(users)
      .values({
        email: opts.email,
        password: passwordHash,
        name: opts.name,
        role: opts.role,
        legalConsented: true,
        legalConsentAt: new Date(),
        emailVerified: true,
      })
      .returning({ id: users.id });

    await tx.insert(wallets).values({ userId: u.id, ...opts.walletSeed });

    return u.id;
  });
}

async function main() {
  console.log('🌱 Seeding database…');

  const adminId = await upsertUser({
    email: 'admin@aicruzz.com',
    password: 'Admin@123!',
    name: 'AiCruzz Admin',
    role: 'ADMIN',
    walletSeed: { credits: 0, pendingRestore: 0 },
  });
  console.log(`✅ Admin: admin@aicruzz.com`);

  const demoUserId = await upsertUser({
    email: 'demo@aicruzz.com',
    password: 'Demo@123!',
    name: 'Demo User',
    role: 'USER',
    walletSeed: {
      credits: 500,
      pendingRestore: 0,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      lastFundedAt: new Date(),
    },
  });
  console.log(`✅ Demo: demo@aicruzz.com`);

  const existingSeedTx = await db.query.transactions.findFirst({
    where: eq(transactions.userId, demoUserId),
    columns: { id: true },
  });
  if (!existingSeedTx) {
    await db.insert(transactions).values({
      userId: demoUserId,
      type: 'ADMIN_CREDIT',
      status: 'COMPLETED',
      creditsBase: 500,
      creditsBonus: 0,
      creditsRestored: 0,
      creditsTotal: 500,
      balanceBefore: 0,
      balanceAfter: 500,
      description: 'Initial demo credits',
      metadata: { seeded: true },
    });
  }

  // Signup consent (skip if already present)
  for (const userId of [adminId, demoUserId]) {
    await db
      .insert(legalConsents)
      .values({ userId, module: 'SIGNUP', version: '1.0' })
      .onConflictDoNothing({ target: [legalConsents.userId, legalConsents.module] });
  }

  console.log('✅ Seed complete');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
