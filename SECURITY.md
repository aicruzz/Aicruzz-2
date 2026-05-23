# Security Model — AiCruzz

## Reporting Vulnerabilities

Email security disclosures to **security@aicruzz.com**. Do NOT open public GitHub issues for security findings.

We will acknowledge within 24 hours and aim to patch critical issues within 7 days.

---

## Authentication

- **Passwords**: hashed with bcrypt at cost factor 12 (≈ 250ms verification time).
- **JWT**: HS256, 256-bit secret (enforced ≥ 32 chars at startup), 7-day default expiry.
- **Session tracking**: every JWT carries a `sessionId` whose SHA-256 hash is stored in `user_sessions` table. Logout invalidates the session row → JWT becomes unusable even before expiry.
- **Multi-device logout**: `POST /api/auth/logout-all` invalidates all sessions for the user.
- **Password change**: invalidates ALL sessions for that user automatically.
- **Login timing**: invalid email triggers a fake bcrypt compare to prevent timing-based user enumeration.

## Authorization

- **Role-based**: `USER` and `ADMIN` enum on the user record.
- **Block status**: `isBlocked` checked on every authenticated request.
- **Admin actions**: gated by `requireAdmin` middleware which checks the JWT `role` field.
- **Legal consent**: `requireLegalConsent('MODULE')` middleware blocks any AI module endpoint until the user has accepted the legal terms for that specific module. Consent is recorded with IP and user agent.

## API Security

### Internal API (`/api/*`)
- JWT in `Authorization: Bearer <token>` header
- CORS restricted to configured origins
- Rate limits:
  - Global: 100 req / 15 min per IP
  - Auth: 10 req / 15 min per IP (brute-force protection)
  - Wallet: 20 req / hour per user
- Helmet headers (CSP, HSTS, X-Frame-Options, etc.)
- Request-size guard (URL ≤ 4 KB, headers ≤ 16 KB)
- Query sanitization (strips `$where`, `$ne`, `$regex`, etc.)

### Public API (`/v1/*`)
- API key auth: `aic_live_<48 hex>` keys (192 bits of entropy)
- Optional IP whitelist per key (CIDR support)
- Per-key rate limits enforced in Redis (sliding 1-minute windows)
- Per-account monthly quotas (active subscription required)
- Credits required AND deducted per request
- API keys can be revoked instantly (no grace period)

## File Uploads

- All uploads pass through dedicated multer instances per category
- MIME-type whitelist enforced (e.g. avatars accept only JPEG/PNG/WebP)
- Per-category file size limits (5 MB avatars → 200 MB video inputs)
- Files stored in segregated subdirectories: `avatars/`, `crypto-proofs/`, `chat-images/`, `chat-videos/`, `cartoon-assets/`, `video-inputs/`, `generated/`
- Filenames are server-generated UUIDs — original names never used in storage paths
- Old avatars are deleted on update to prevent disk bloat

## Payment Security

### Stripe
- All Stripe API calls server-side only — secret key never exposed to client
- Webhook signature verified with `stripe.webhooks.constructEvent`
- Webhook is idempotent — same `payment_intent.id` cannot credit twice
- Stripe customer ID linked to `aicruzz_user_id` metadata for traceability

### Crypto
- Manual review by admin for every payment
- Proof image uploaded to dedicated subdirectory
- Audit trail: who approved, when, with note
- Credits added only on explicit admin approval

## Data Protection

- All sensitive operations logged in `activity_logs` with severity (INFO/WARN/ERROR/CRITICAL)
- IP and user-agent captured for audit
- Database queries use Prisma parameterization (SQL injection prevented by ORM)
- Crypto wallet addresses kept as env vars, not in DB

## WebRTC / Live Cam

- Internal billing endpoint requires shared secret (`x-webrtc-secret`)
- Sessions auto-end when credits exhausted (server-side enforcement)
- Per-second deduction makes session abandonment safe
- Session metadata logged on start and end

## Production Hardening

In production (`NODE_ENV=production`):
- HSTS enabled (1-year max-age, includeSubDomains, preload)
- Strict CSP via Helmet
- Logs in JSON format (Winston) for ingestion to log aggregators
- Authenticated responses sent with `Cache-Control: private, no-store`

## What's NOT in scope

- DDoS protection (use Cloudflare / AWS Shield in front)
- WAF rules (use Nginx ModSecurity or cloud WAF)
- Email OTP / 2FA (planned for v2)
- KYC for crypto payments above threshold (regulatory)

## Threat Model

| Threat | Mitigation |
|--------|------------|
| Brute-force login | Rate limit + bcrypt cost 12 |
| Stolen JWT | Server-side session invalidation |
| Stripe webhook spoofing | Signature verification |
| Credit duplication via webhook replay | DB idempotency check on payment intent ID |
| Insider abuse (admin) | All admin actions logged with severity WARN+ |
| Non-consensual deepfakes | Mandatory legal consent + activity logging + admin block tools |
| Malicious file uploads | MIME whitelist + size limits + isolated subdirs |
| API key leak | Revoke + IP whitelist + rate limit per key |
| Resource exhaustion (Live Cam) | Per-second billing auto-ends session on insufficient credits |
| Race condition on credit deduction | Serializable Prisma transaction |
