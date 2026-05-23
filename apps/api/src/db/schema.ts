import {
  pgTable,
  pgEnum,
  text,
  boolean,
  timestamp,
  doublePrecision,
  integer,
  json,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ─────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────

export const roleEnum = pgEnum('Role', ['USER', 'ADMIN']);

export const transactionTypeEnum = pgEnum('TransactionType', [
  'FUND',
  'DEDUCT',
  'REFUND',
  'ADMIN_CREDIT',
  'ADMIN_DEDUCT',
  'EXPIRY',
  'RESTORE',
  'BONUS',
]);

export const transactionStatusEnum = pgEnum('TransactionStatus', [
  'PENDING',
  'COMPLETED',
  'FAILED',
  'REFUNDED',
]);

export const cryptoCurrencyEnum = pgEnum('CryptoCurrency', [
  'BTC',
  'USDT_TRC20',
  'USDT_ERC20',
]);

export const cryptoStatusEnum = pgEnum('CryptoStatus', [
  'PENDING',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
]);

export const apiPlanEnum = pgEnum('ApiPlan', [
  'DEVELOPER_BASIC',
  'DEVELOPER_PRO',
  'DEVELOPER_ELITE',
]);

export const subscriptionStatusEnum = pgEnum('SubscriptionStatus', [
  'ACTIVE',
  'PAST_DUE',
  'CANCELLED',
  'EXPIRED',
  'TRIALING',
]);

export const logSeverityEnum = pgEnum('LogSeverity', [
  'INFO',
  'WARN',
  'ERROR',
  'CRITICAL',
]);

export const sessionStatusEnum = pgEnum('SessionStatus', [
  'ACTIVE',
  'ENDED',
  'INTERRUPTED',
]);

export const jobStatusEnum = pgEnum('JobStatus', [
  'QUEUED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);

export const videoResolutionEnum = pgEnum('VideoResolution', [
  'SD_480P',
  'HD_720P',
  'FHD_1080P',
]);

export const qualityModeEnum = pgEnum('QualityMode', [
  'STANDARD',
  'HIGH',
  'ULTRA',
]);

export const messageRoleEnum = pgEnum('MessageRole', [
  'USER',
  'ASSISTANT',
  'SYSTEM',
]);

export const cartoonTypeEnum = pgEnum('CartoonType', [
  'ANIMATED_AD',
  'HUMAN_CARTOON',
  'CUSTOM',
]);

// ─────────────────────────────────────────────────────────────
// USERS
// ─────────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    email: text('email').notNull().unique(),
    password: text('password').notNull(),
    name: text('name'),
    role: roleEnum('role').default('USER').notNull(),
    isBlocked: boolean('is_blocked').default(false).notNull(),
    blockedReason: text('blocked_reason'),
    legalConsented: boolean('legal_consented').default(false).notNull(),
    legalConsentAt: timestamp('legal_consent_at'),
    emailVerified: boolean('email_verified').default(false).notNull(),
    avatarUrl: text('avatar_url'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('users_email_idx').on(t.email),
    index('users_role_idx').on(t.role),
    index('users_is_blocked_idx').on(t.isBlocked),
  ]
);

export const usersRelations = relations(users, ({ one, many }) => ({
  wallet: one(wallets, { fields: [users.id], references: [wallets.userId] }),
  transactions: many(transactions),
  cryptoPayments: many(cryptoPayments),
  apiKeys: many(apiKeys),
  apiSubscription: one(apiSubscriptions, { fields: [users.id], references: [apiSubscriptions.userId] }),
  legalConsents: many(legalConsents),
  activityLogs: many(activityLogs),
  sessions: many(userSessions),
  chats: many(chats),
  cartoonTemplates: many(cartoonTemplates),
  cartoonJobs: many(cartoonJobs),
}));

// ─────────────────────────────────────────────────────────────
// USER SESSIONS
// ─────────────────────────────────────────────────────────────

export const userSessions = pgTable(
  'user_sessions',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    deviceInfo: text('device_info'),
    ipAddress: text('ip_address'),
    isValid: boolean('is_valid').default(true).notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('user_sessions_user_id_idx').on(t.userId),
    index('user_sessions_token_hash_idx').on(t.tokenHash),
  ]
);

export const userSessionsRelations = relations(userSessions, ({ one }) => ({
  user: one(users, { fields: [userSessions.userId], references: [users.id] }),
}));

// ─────────────────────────────────────────────────────────────
// WALLET
// ─────────────────────────────────────────────────────────────

export const wallets = pgTable('wallets', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  credits: doublePrecision('credits').default(0).notNull(),
  pendingRestore: doublePrecision('pending_restore').default(0).notNull(),
  totalFundedUsd: doublePrecision('total_funded_usd').default(0).notNull(),
  expiresAt: timestamp('expires_at'),
  lastFundedAt: timestamp('last_funded_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const walletsRelations = relations(wallets, ({ one }) => ({
  user: one(users, { fields: [wallets.userId], references: [users.id] }),
}));

// ─────────────────────────────────────────────────────────────
// TRANSACTIONS
// ─────────────────────────────────────────────────────────────

export const transactions = pgTable(
  'transactions',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull().references(() => users.id),
    type: transactionTypeEnum('type').notNull(),
    status: transactionStatusEnum('status').default('PENDING').notNull(),
    usdAmount: doublePrecision('usd_amount'),
    creditsBase: doublePrecision('credits_base').default(0).notNull(),
    creditsBonus: doublePrecision('credits_bonus').default(0).notNull(),
    creditsRestored: doublePrecision('credits_restored').default(0).notNull(),
    creditsTotal: doublePrecision('credits_total').default(0).notNull(),
    balanceBefore: doublePrecision('balance_before').default(0).notNull(),
    balanceAfter: doublePrecision('balance_after').default(0).notNull(),
    description: text('description').notNull(),
    module: text('module'),
    metadata: json('metadata'),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    stripeSessionId: text('stripe_session_id'),
    cryptoPaymentId: text('crypto_payment_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('transactions_user_id_idx').on(t.userId),
    index('transactions_type_idx').on(t.type),
    index('transactions_status_idx').on(t.status),
    index('transactions_created_at_idx').on(t.createdAt),
  ]
);

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, { fields: [transactions.userId], references: [users.id] }),
}));

// ─────────────────────────────────────────────────────────────
// CRYPTO PAYMENTS
// ─────────────────────────────────────────────────────────────

export const cryptoPayments = pgTable(
  'crypto_payments',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull().references(() => users.id),
    currency: cryptoCurrencyEnum('currency').notNull(),
    usdAmount: doublePrecision('usd_amount').notNull(),
    walletAddress: text('wallet_address').notNull(),
    txHash: text('tx_hash'),
    proofImageUrl: text('proof_image_url'),
    notes: text('notes'),
    status: cryptoStatusEnum('status').default('PENDING').notNull(),
    adminNote: text('admin_note'),
    approvedBy: text('approved_by'),
    approvedAt: timestamp('approved_at'),
    rejectedAt: timestamp('rejected_at'),
    creditsToAdd: doublePrecision('credits_to_add'),
    bonusCredits: doublePrecision('bonus_credits'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('crypto_payments_user_id_idx').on(t.userId),
    index('crypto_payments_status_idx').on(t.status),
    index('crypto_payments_created_at_idx').on(t.createdAt),
  ]
);

export const cryptoPaymentsRelations = relations(cryptoPayments, ({ one }) => ({
  user: one(users, { fields: [cryptoPayments.userId], references: [users.id] }),
}));

// ─────────────────────────────────────────────────────────────
// API KEYS
// ─────────────────────────────────────────────────────────────

export const apiKeys = pgTable(
  'api_keys',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull().unique(),
    name: text('name').notNull(),
    prefix: text('prefix').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    totalRequests: integer('total_requests').default(0).notNull(),
    lastUsedAt: timestamp('last_used_at'),
    ipWhitelist: text('ip_whitelist'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('api_keys_user_id_idx').on(t.userId),
    index('api_keys_key_idx').on(t.key),
  ]
);

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, { fields: [apiKeys.userId], references: [users.id] }),
}));

// ─────────────────────────────────────────────────────────────
// API SUBSCRIPTIONS
// ─────────────────────────────────────────────────────────────

export const apiSubscriptions = pgTable('api_subscriptions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  plan: apiPlanEnum('plan').notNull(),
  status: subscriptionStatusEnum('status').default('ACTIVE').notNull(),
  requestsPerMinute: integer('requests_per_minute').notNull(),
  requestsPerMonth: integer('requests_per_month').notNull(),
  requestsUsedThisMonth: integer('requests_used_this_month').default(0).notNull(),
  lastResetAt: timestamp('last_reset_at').defaultNow().notNull(),
  usdPriceMonthly: doublePrecision('usd_price_monthly').notNull(),
  currentPeriodStart: timestamp('current_period_start').notNull(),
  currentPeriodEnd: timestamp('current_period_end').notNull(),
  stripeSubscriptionId: text('stripe_subscription_id'),
  stripeCustomerId: text('stripe_customer_id'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false).notNull(),
  cancelledAt: timestamp('cancelled_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const apiSubscriptionsRelations = relations(apiSubscriptions, ({ one }) => ({
  user: one(users, { fields: [apiSubscriptions.userId], references: [users.id] }),
}));

// ─────────────────────────────────────────────────────────────
// LEGAL CONSENTS
// ─────────────────────────────────────────────────────────────

export const legalConsents = pgTable(
  'legal_consents',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    module: text('module').notNull(),
    version: text('version').default('1.0').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    acceptedAt: timestamp('accepted_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('legal_consents_user_id_module_idx').on(t.userId, t.module),
    index('legal_consents_user_id_idx').on(t.userId),
  ]
);

export const legalConsentsRelations = relations(legalConsents, ({ one }) => ({
  user: one(users, { fields: [legalConsents.userId], references: [users.id] }),
}));

// ─────────────────────────────────────────────────────────────
// ACTIVITY LOGS
// ─────────────────────────────────────────────────────────────

export const activityLogs = pgTable(
  'activity_logs',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    module: text('module'),
    severity: logSeverityEnum('severity').default('INFO').notNull(),
    details: json('details'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('activity_logs_user_id_idx').on(t.userId),
    index('activity_logs_action_idx').on(t.action),
    index('activity_logs_created_at_idx').on(t.createdAt),
  ]
);

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  user: one(users, { fields: [activityLogs.userId], references: [users.id] }),
}));

// ─────────────────────────────────────────────────────────────
// LIVE CAM SESSIONS
// ─────────────────────────────────────────────────────────────

export const liveCamSessions = pgTable(
  'live_cam_sessions',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull(),
    status: sessionStatusEnum('status').default('ACTIVE').notNull(),
    creditsPerSecond: doublePrecision('credits_per_second').default(0.2).notNull(),
    totalSeconds: integer('total_seconds').default(0).notNull(),
    totalCredits: doublePrecision('total_credits').default(0).notNull(),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    endedAt: timestamp('ended_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('live_cam_sessions_user_id_idx').on(t.userId),
    index('live_cam_sessions_status_idx').on(t.status),
  ]
);

// ─────────────────────────────────────────────────────────────
// VIDEO JOBS
// ─────────────────────────────────────────────────────────────

export const videoJobs = pgTable(
  'video_jobs',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull(),
    status: jobStatusEnum('status').default('QUEUED').notNull(),
    prompt: text('prompt'),
    inputImageUrl: text('input_image_url'),
    inputVideoUrl: text('input_video_url'),
    voiceEnabled: boolean('voice_enabled').default(false).notNull(),
    durationSeconds: integer('duration_seconds').default(5).notNull(),
    resolution: videoResolutionEnum('resolution').default('HD_720P').notNull(),
    qualityMode: qualityModeEnum('quality_mode').default('STANDARD').notNull(),
    provider: text('provider'),
    creditsCharged: doublePrecision('credits_charged').default(0).notNull(),
    creditRefunded: boolean('credit_refunded').default(false).notNull(),
    outputUrl: text('output_url'),
    thumbnailUrl: text('thumbnail_url'),
    errorMessage: text('error_message'),
    queueJobId: text('queue_job_id'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('video_jobs_user_id_idx').on(t.userId),
    index('video_jobs_status_idx').on(t.status),
    index('video_jobs_created_at_idx').on(t.createdAt),
  ]
);

// ─────────────────────────────────────────────────────────────
// CHATS
// ─────────────────────────────────────────────────────────────

export const chats = pgTable(
  'chats',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').default('New Chat').notNull(),
    model: text('model').default('claude-sonnet-4-6').notNull(),
    strategy: text('strategy').default('AUTO').notNull(),
    totalCredits: doublePrecision('total_credits').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('chats_user_id_idx').on(t.userId),
    index('chats_created_at_idx').on(t.createdAt),
  ]
);

export const chatsRelations = relations(chats, ({ one, many }) => ({
  user: one(users, { fields: [chats.userId], references: [users.id] }),
  messages: many(chatMessages),
}));

// ─────────────────────────────────────────────────────────────
// CHAT MESSAGES
// ─────────────────────────────────────────────────────────────

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    chatId: text('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
    role: messageRoleEnum('role').notNull(),
    content: text('content').notNull(),
    imageUrl: text('image_url'),
    videoUrl: text('video_url'),
    provider: text('provider'),
    model: text('model'),
    tokensUsed: integer('tokens_used'),
    latencyMs: integer('latency_ms'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('chat_messages_chat_id_idx').on(t.chatId),
    index('chat_messages_created_at_idx').on(t.createdAt),
  ]
);

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  chat: one(chats, { fields: [chatMessages.chatId], references: [chats.id] }),
}));

// ─────────────────────────────────────────────────────────────
// CARTOON TEMPLATES
// ─────────────────────────────────────────────────────────────

export const cartoonTemplates = pgTable(
  'cartoon_templates',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    thumbnailUrl: text('thumbnail_url'),
    type: cartoonTypeEnum('type').default('CUSTOM').notNull(),
    isPublic: boolean('is_public').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('cartoon_templates_user_id_idx').on(t.userId),
    index('cartoon_templates_is_public_idx').on(t.isPublic),
  ]
);

export const cartoonTemplatesRelations = relations(cartoonTemplates, ({ one, many }) => ({
  user: one(users, { fields: [cartoonTemplates.userId], references: [users.id] }),
  scenes: many(cartoonScenes),
  jobs: many(cartoonJobs),
}));

// ─────────────────────────────────────────────────────────────
// CARTOON SCENES
// ─────────────────────────────────────────────────────────────

export const cartoonScenes = pgTable(
  'cartoon_scenes',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    templateId: text('template_id').notNull().references(() => cartoonTemplates.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    order: integer('order').default(0).notNull(),
    prompt: text('prompt'),
    imageUrl: text('image_url'),
    durationSecs: doublePrecision('duration_secs').default(3.0).notNull(),
    transition: text('transition'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('cartoon_scenes_template_id_idx').on(t.templateId),
    index('cartoon_scenes_order_idx').on(t.order),
  ]
);

export const cartoonScenesRelations = relations(cartoonScenes, ({ one }) => ({
  template: one(cartoonTemplates, { fields: [cartoonScenes.templateId], references: [cartoonTemplates.id] }),
}));

// ─────────────────────────────────────────────────────────────
// CARTOON JOBS
// ─────────────────────────────────────────────────────────────

export const cartoonJobs = pgTable(
  'cartoon_jobs',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull().references(() => users.id),
    templateId: text('template_id').references(() => cartoonTemplates.id, { onDelete: 'set null' }),
    type: cartoonTypeEnum('type').notNull(),
    status: jobStatusEnum('status').default('QUEUED').notNull(),
    prompt: text('prompt'),
    stylePrompt: text('style_prompt'),
    inputImageUrl: text('input_image_url'),
    inputVideoUrl: text('input_video_url'),
    durationSecs: doublePrecision('duration_secs').default(5.0).notNull(),
    aspectRatio: text('aspect_ratio').default('16:9').notNull(),
    animationStyle: text('animation_style').default('cartoon').notNull(),
    creditsCharged: doublePrecision('credits_charged').default(0).notNull(),
    creditRefunded: boolean('credit_refunded').default(false).notNull(),
    provider: text('provider'),
    queueJobId: text('queue_job_id'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    outputUrl: text('output_url'),
    thumbnailUrl: text('thumbnail_url'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('cartoon_jobs_user_id_idx').on(t.userId),
    index('cartoon_jobs_status_idx').on(t.status),
    index('cartoon_jobs_created_at_idx').on(t.createdAt),
  ]
);

export const cartoonJobsRelations = relations(cartoonJobs, ({ one }) => ({
  user: one(users, { fields: [cartoonJobs.userId], references: [users.id] }),
  template: one(cartoonTemplates, { fields: [cartoonJobs.templateId], references: [cartoonTemplates.id] }),
}));

// ─────────────────────────────────────────────────────────────
// PHASE 2 — REUSABLE ASSET / CHARACTER LIBRARY + JOB METADATA
//
// Additive tables ONLY. The existing cartoonType enum, cartoonJobs,
// videoJobs, cartoonTemplates and cartoonScenes are intentionally
// untouched. All new cartoon-mode / character / voice / multi-asset
// data lives here, keyed by jobId, so Phase 1 pipeline + router
// contracts are unaffected. `type`/`mode`/`module` are plain text
// (validated at the app layer) to avoid any Postgres enum migration.
// ─────────────────────────────────────────────────────────────

// Reusable saved assets: faces, characters, voices, backgrounds, logos, scenes.
export const userAssets = pgTable(
  'user_assets',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    // FACE | CHARACTER | VOICE | BACKGROUND | LOGO | SCENE  (app-validated)
    type: text('type').notNull(),
    name: text('name').notNull(),
    url: text('url').notNull(),
    thumbnailUrl: text('thumbnail_url'),
    meta: json('meta'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('user_assets_user_id_idx').on(t.userId),
    index('user_assets_type_idx').on(t.type),
  ]
);

export const userAssetsRelations = relations(userAssets, ({ one }) => ({
  user: one(users, { fields: [userAssets.userId], references: [users.id] }),
}));

// Named, reusable cartoon characters with persistent appearance.
export const customCharacters = pgTable(
  'custom_characters',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    baseImageUrl: text('base_image_url'),
    // [{ name, url }] — alternate expressions / poses
    expressions: json('expressions'),
    stylePrompt: text('style_prompt'),
    thumbnailUrl: text('thumbnail_url'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('custom_characters_user_id_idx').on(t.userId)]
);

export const customCharactersRelations = relations(customCharacters, ({ one }) => ({
  user: one(users, { fields: [customCharacters.userId], references: [users.id] }),
}));

// Per-generation-job metadata. Decouples new VIDEO/CARTOON mode data from
// the legacy job tables (no column/enum changes). jobId is the cartoon_jobs
// / video_jobs row id (no cross-table FK so it stays module-agnostic).
export const generationJobsMetadata = pgTable(
  'generation_jobs_metadata',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    jobId: text('job_id').notNull(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    module: text('module').notNull(), // CARTOON | VIDEO
    // App-layer mode: ANIMATED_AD | HUMAN_CARTOON | CUSTOM_CHARACTER | CLASSIC_CARTOON
    mode: text('mode').notNull(),
    characterId: text('character_id').references(() => customCharacters.id, {
      onDelete: 'set null',
    }),
    // { faceUrl?, backgroundUrl?, logoUrl?, extraImageUrls?: string[] }
    assetRefs: json('asset_refs'),
    voiceMode: text('voice_mode'), // NONE | UPLOAD | CLONE | AI
    voiceText: text('voice_text'),
    voiceAssetId: text('voice_asset_id'),
    extra: json('extra'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('generation_jobs_metadata_job_id_idx').on(t.jobId),
    index('generation_jobs_metadata_user_id_idx').on(t.userId),
    index('generation_jobs_metadata_mode_idx').on(t.mode),
  ]
);

export const generationJobsMetadataRelations = relations(
  generationJobsMetadata,
  ({ one }) => ({
    user: one(users, {
      fields: [generationJobsMetadata.userId],
      references: [users.id],
    }),
    character: one(customCharacters, {
      fields: [generationJobsMetadata.characterId],
      references: [customCharacters.id],
    }),
  }),
);

// ─────────────────────────────────────────────────────────────
// PHASE 4 — VOICE ↔ CHARACTER LINK (additive new table only)
// One reusable saved voice (a user_assets row of type VOICE) bound
// to a custom character. No existing table/enum changed.
// ─────────────────────────────────────────────────────────────
export const characterVoiceLinks = pgTable(
  'character_voice_links',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    characterId: text('character_id')
      .notNull()
      .references(() => customCharacters.id, { onDelete: 'cascade' }),
    voiceAssetId: text('voice_asset_id')
      .notNull()
      .references(() => userAssets.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('character_voice_links_character_id_idx').on(t.characterId),
    index('character_voice_links_user_id_idx').on(t.userId),
  ]
);

export const characterVoiceLinksRelations = relations(
  characterVoiceLinks,
  ({ one }) => ({
    user: one(users, {
      fields: [characterVoiceLinks.userId],
      references: [users.id],
    }),
    character: one(customCharacters, {
      fields: [characterVoiceLinks.characterId],
      references: [customCharacters.id],
    }),
    voiceAsset: one(userAssets, {
      fields: [characterVoiceLinks.voiceAssetId],
      references: [userAssets.id],
    }),
  }),
);

// ─────────────────────────────────────────────────────────────
// PHASE 5b — FEATURED SHOWCASE BANNERS (additive new table only)
// Global, admin-managed showcase videos surfaced under each studio's
// "Preview & generate" card. No user FK (these are not user assets).
// `module` is plain text (VIDEO | CARTOON), app-validated — no enum
// migration. No existing table/contract changed.
// ─────────────────────────────────────────────────────────────
export const featuredBanners = pgTable(
  'featured_banners',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    module: text('module').notNull(), // VIDEO | CARTOON  (app-validated)
    title: text('title').notNull(),
    prompt: text('prompt').notNull(),
    videoUrl: text('video_url').notNull(),
    thumbnailUrl: text('thumbnail_url'),
    // string[]
    tags: json('tags'),
    // { durationSecs?, aspectRatio?, qualityTier?, voiceMode?, resolution? }
    metadata: json('metadata'),
    isActive: boolean('is_active').default(true).notNull(),
    isNew: boolean('is_new').default(false).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    rotationInterval: integer('rotation_interval').default(6000).notNull(), // ms
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('featured_banners_module_idx').on(t.module),
    index('featured_banners_active_idx').on(t.isActive),
  ]
);