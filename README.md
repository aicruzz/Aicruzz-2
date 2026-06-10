# AiCruzz — Full Production SaaS Platform

AiCruzz is a complete, deployable, monetizable AI creative platform: real-time face swap (Live Cam), text/image-to-video generation, multi-modal AI chat, animated cartoon studio, voice synthesis, and a public developer API — with a complete wallet/credits/subscription billing system on top.

---

## Architecture

```
┌────────────────┐
│   apps/web     │  Next.js 14 frontend (port 3000)
└───────┬────────┘
        │ HTTPS / WebSocket
┌───────▼────────┐    ┌──────────────────┐
│   apps/api     │◄──►│   PostgreSQL     │
│  (port 4000)   │    │   + Prisma       │
└──┬─────────┬───┘    └──────────────────┘
   │         │
   │         └──►┌───────────────┐
   │            │     Redis      │  rate-limit, queue, cache
   │            └───────────────┘
   │
   ├──►┌────────────────┐
   │   │ apps/ai-router │  AI provider decision engine (port 4001)
   │   └─────┬──────────┘
   │         │
   │         ├──► OpenAI / Anthropic / ElevenLabs / Runway / Pika
   │         └──► apps/worker  (Python GPU, port 8000)
   │
   └──►┌────────────────┐
       │  apps/webrtc   │  mediasoup SFU (port 4002) — Live Cam
       └────────────────┘
```

Five services, one monorepo, npm workspaces.

---

## Phase Build Status

| Phase | Module                                              | Status |
| ----- | --------------------------------------------------- | ------ |
| 1     | Database + Wallet system                            | ✅     |
| 2     | Authentication (signup/login/JWT)                   | ✅     |
| 3     | Backend Core APIs (users, admin, legal, uploads)    | ✅     |
| 4     | AI Router (cost/speed/quality routing + fallback)   | ✅     |
| 5     | AI Chat (streaming SSE, file uploads)               | ✅     |
| 6     | Video Generation (text-to-video, lip sync)          | ✅     |
| 7     | Deep Live Cam (mediasoup, voice changer, recording) | ✅     |
| 8     | Cartoon Studio (templates, scenes, animated ads)    | ✅     |
| 9     | Public API Platform (keys, subscriptions, /v1/\*)   | ✅     |
| 10    | UI polish + optimization + security                 | ✅     |

---

## Quick Start (Development)

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9
- Docker & Docker Compose
- Python 3.10+ (for the GPU worker)

### 1. Clone and install

```bash
git clone <your-repo> aicruzz && cd aicruzz
npm install --legacy-peer-deps
```

### 2. Start infrastructure

```bash
docker-compose up -d postgres redis
```

### 3. Configure environment

```bash
cp .env.example apps/api/.env
# Fill in: JWT_SECRET, STRIPE_*, ADMIN_WALLET_*, AI provider keys
```

### 4. Database setup

```bash
cd apps/api
../../node_modules/.bin/prisma migrate dev --name init
../../node_modules/.bin/ts-node prisma/seed.ts
cd ../..
```

### 5. Start all services (separate terminals)

how to ssh
ssh -i ~/aicruzz-new.pem ubuntu@32.192.133.173

rsync -av --exclude "venv" --exclude "**pycache**" --exclude "\*.pyc" \
-e "ssh -i ~/aicruzz-new.pem" . ubuntu@32.192.133.173:~/worker


ssh -i ~/aicruzz-new.pem ubuntu@32.192.133.173
cd ~/worker
pm2 restart gpu-api
pm2 logs gpu-api

2349061484957

```bash
# Terminal 1 — API. Dont START again
cd apps/api && ../../node_modules/.bin/ts-node-dev --respawn --transpile-only src/index.ts

# Terminal 2 — AI Router
cd apps/ai-router && ../../node_modules/.bin/ts-node-dev --respawn --transpile-only src/index.ts

# Terminal 3 — WebRTC (only if testing Live Cam)
cd apps/webrtc && ../../node_modules/.bin/ts-node-dev --respawn --transpile-only src/index.ts


# Terminal 4 — Worker (Python). Dont START again
cd apps/worker && pip install -e . && uvicorn app.main:app --reload --port 8000 or uvicorn app.main:app --reload --port 8000

uvicorn apps.worker.app.main:app --host 0.0.0.0 --port 8000

# Terminal 5 — Web. Dont START again
cd apps/web && ../../node_modules/.bin/next dev

# Only use for Web & API
npm run dev
```
```bash
Don't START WORKER again

# If you deploy new code and want to restart the worker:
sudo systemctl restart aicruzz-worker

# To stop it:
sudo systemctl stop aicruzz-worker

# To start it again:
sudo systemctl start aicruzz-worker

# To watch logs:
journalctl -u aicruzz-worker -f

# To check status:
sudo systemctl status aicruzz-worker
```

source venv/bin/activate

pm2 logs gpu-api --lines 200

Open `http://localhost:3000`.

**Demo credentials (from `prisma/seed.ts`):**

- Admin: `admin@aicruzz.com` / `Admin@123!`
- User: `demo@aicruzz.com` / `Demo@123!` (starts with 500 credits)

---

## Production Deployment. curl http://localhost:4001/health

```bash
# Configure production secrets
cp .env.example .env
# Fill: POSTGRES_PASSWORD, REDIS_PASSWORD, all API keys, Stripe live keys

# Build and start the full stack
docker-compose -f docker-compose.prod.yml up -d --build

# Run migrations
docker exec aicruzz_api npx prisma migrate deploy

# Seed (optional)
docker exec aicruzz_api npx ts-node prisma/seed.ts
```

See **DEPLOY.md** for detailed production setup including SSL, Nginx, Stripe webhook configuration, and GPU enablement.

---

## API Reference

### Internal API (`/api/*`, JWT auth)

| Module       | Endpoints                                                       | Notes                                                |
| ------------ | --------------------------------------------------------------- | ---------------------------------------------------- |
| Auth         | `/api/auth/{signup,login,me,logout,...}`                        | bcrypt + JWT + session tracking                      |
| Wallet       | `/api/wallet/{balance,preview,transactions,crypto/submit}`      | $1 = 10 credits, bonus tiers, 30-day expiry, restore |
| Stripe       | `/api/billing/stripe/{create-intent,webhook}`                   | Auto-credits via webhook                             |
| Users        | `/api/users/me/{profile,avatar}`                                | Plus admin endpoints                                 |
| Admin        | `/api/admin/{stats,users/:id/block,transactions,wallets,logs}`  | ADMIN role only                                      |
| Chat         | `/api/chat/{,:id,message,upload}`                               | SSE streaming                                        |
| Video        | `/api/video/{generate,jobs/:id,jobs/:id/cancel,estimate}`       | Async via BullMQ                                     |
| Live Cam     | `/api/live-cam/{start,billing-tick,session-end,active,history}` | WebRTC signaling                                     |
| Cartoon      | `/api/cartoon/{templates/*,generate,jobs/*,upload-asset}`       | Animated ads + human cartoon + custom                |
| API Platform | `/api/api-platform/{plans,keys,subscribe,subscription/cancel}`  | User-facing key management                           |
| Legal        | `/api/legal/{consent,consents}`                                 | Consent recording                                    |
| Health       | `/health` (liveness), `/health/ready` (DB+Redis+router check)   |                                                      |

### Public API (`/v1/*`, API key auth)

For external developers. Requires both an active API subscription AND credits.

| Endpoint               | Method | Cost        | Returns                       |
| ---------------------- | ------ | ----------- | ----------------------------- |
| `/v1/chat/completions` | POST   | 2 cr        | Text response                 |
| `/v1/image/generate`   | POST   | 5–10 cr     | Image URL                     |
| `/v1/voice/generate`   | POST   | ~0.5 cr/sec | Audio URL                     |
| `/v1/video/generate`   | POST   | 50–300 cr   | Job ID (async)                |
| `/v1/cartoon/generate` | POST   | 15–25 cr    | Job ID (async)                |
| `/v1/jobs/:jobId`      | GET    | Free        | Job status                    |
| `/v1/usage`            | GET    | Free        | Subscription + credit balance |

Auth: `x-api-key: aic_live_...` or `Authorization: Bearer aic_live_...`

Headers on every response: `X-RateLimit-{Limit,Remaining}`, `X-Quota-{Limit,Remaining}`, `X-Credits-{Charged,Remaining}`.

---


What was actually broken (for future reference)

You fixed 3 core issues:

❌ Frame shape mismatch → ✔ fixed normalization
❌ ffmpeg export crash → ✔ fixed channel formatting
❌ thumbnails 404 → ✔ static mount + generation order fixed

This is now a stable GPU video generation API.

## Business Rules (enforced server-side)

### Wallet

- $1 = 10 credits
- Minimum funding: $10
- Bonus tiers: $10–19 base, $20–49 +10%, $50–99 +15%, $100+ +20%
- Credits expire 30 days after last fund
- On re-fund: previously expired credits are restored AND new credits are added AND expiry resets to 30 days

### Per-module Credit Costs

| Module   | Cost                                                            |
| -------- | --------------------------------------------------------------- |
| Live Cam | 0.2 credits/second (12 cr/min) — billed continuously while live |
| Video    | 10 cr/sec base × resolution × quality                           |
| Image    | 5 cr standard, 10 cr high quality                               |
| Voice    | 0.5 cr/sec                                                      |
| Chat     | 2 cr/message                                                    |
| Cartoon  | 15–25 cr base + duration scaling                                |

Deduction happens BEFORE processing. Refunded automatically on failure or cancellation.

### Subscription vs Credits (Public API)

- Subscription = access (rate limit + monthly quota)
- Credits = usage (consumed per AI call)
- BOTH required for `/v1/*` calls

---

## Security

See **SECURITY.md** for full security model. Highlights:

- bcrypt password hashing (12 rounds)
- JWT + session tracking (logout-from-all-devices supported)
- Constant-time login comparison (timing attack prevention)
- Rate limiting (global, auth-specific, wallet-specific, API-key-specific)
- Mandatory legal consent before AI module access
- File upload validation (MIME type + size + dedicated subdirs)
- Helmet + HSTS + CSP in production
- Query sanitization, request size guards
- Stripe webhook signature verification
- IP whitelist support for API keys

Report security issues per **SECURITY.md**.

---

## Tech Stack

- **Backend**: Node.js 20, Express, TypeScript, Prisma
- **Database**: PostgreSQL 16
- **Cache/Queue**: Redis 7 + BullMQ
- **Frontend**: Next.js 14 (App Router), Tailwind, Lucide, Framer Motion
- **AI**: OpenAI, Anthropic, ElevenLabs, Runway, Pika + local GPU
- **Payments**: Stripe (one-time + recurring) + Crypto (BTC, USDT)
- **WebRTC**: mediasoup (SFU)
- **GPU Worker**: Python 3.11, FastAPI, Diffusers/InsightFace
- **Deployment**: Docker + docker-compose, Nginx reverse proxy

---

## License

Proprietary. All rights reserved.

2|gpu-api | 2026-05-07 15:23:48,615 [INFO] app.routes.image: [image] Image pipeline loaded on cuda:0, dtype=torch.float16
2|gpu-api | 2026-05-07 15:23:48,615 [INFO] app.routes.image: [image] Image generated on cuda:0, dtype=torch.float16, steps=20, size=1280x720, prompt='Generate a live ball'
2|gpu-api | INFO: 102.89.82.237:51491 - "GET /health HTTP/1.1" 200 OK
2|gpu-api | 2026-05-07 15:23:55,202 [INFO] httpx: HTTP Request: GET https://huggingface.co/api/models/stabilityai/stable-diffusion-2-1 "HTTP/1.1 401 Unauthorized"
2|gpu-api | Couldn't connect to the Hub: 401 Client Error. (Request ID: Root=1-69fcae8b-62c5740967c8c3ac485bf2e3;31c78ffe-81e0-4786-848f-a0544e0ef7cb)
2|gpu-api | Repository Not Found for url: https://huggingface.co/api/models/stabilityai/stable-diffusion-2-1.
2|gpu-api | Please make sure you specified the correct `repo_id` and `repo_type`.
2|gpu-api | If you are trying to access a private or gated repo, make sure you are authenticated and your token has the required permissions.
2|gpu-api | For more details, see https://huggingface.co/docs/huggingface_hub/authentication
2|gpu-api | Invalid username or password..
2|gpu-api | Will try to load from local cache.
2|gpu-api | 2026-05-07 15:23:55,203 [ERROR] app.routes.image: [image] Inference error: Cannot load model stabilityai/stable-diffusion-2-1: model is not cached locally and an error occurred while trying to fetch metadata from the Hub. Please check out the root cause in the stacktrace above.
2|gpu-api | Traceback (most recent call last):
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/huggingface_hub/utils/\_http.py", line 761, in hf_raise_for_status
2|gpu-api | response.raise_for_status()
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/httpx/\_models.py", line 829, in raise_for_status
2|gpu-api | raise HTTPStatusError(message, request=request, response=self)
2|gpu-api | httpx.HTTPStatusError: Client error '401 Unauthorized' for url 'https://huggingface.co/api/models/stabilityai/stable-diffusion-2-1'
2|gpu-api | For more information check: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/401
2|gpu-api | The above exception was the direct cause of the following exception:
2|gpu-api | Traceback (most recent call last):
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/diffusers/pipelines/pipeline_utils.py", line 1643, in download
2|gpu-api | info = model_info(pretrained_model_name, token=token, revision=revision)
2|gpu-api | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/huggingface_hub/utils/\_validators.py", line 88, in \_inner_fn
2|gpu-api | return fn(*args, \*\*kwargs)
2|gpu-api | ^^^^^^^^^^^^^^^^^^^
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/huggingface_hub/hf_api.py", line 3209, in model_info
2|gpu-api | hf_raise_for_status(r)
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/huggingface_hub/utils/\_http.py", line 835, in hf_raise_for_status
2|gpu-api | raise \_format(RepositoryNotFoundError, message, response, repo_type=repo_type, repo_id=repo_id) from e
2|gpu-api | huggingface_hub.errors.RepositoryNotFoundError: 401 Client Error. (Request ID: Root=1-69fcae8b-62c5740967c8c3ac485bf2e3;31c78ffe-81e0-4786-848f-a0544e0ef7cb)
2|gpu-api | Repository Not Found for url: https://huggingface.co/api/models/stabilityai/stable-diffusion-2-1.
2|gpu-api | Please make sure you specified the correct `repo_id` and `repo_type`.
2|gpu-api | If you are trying to access a private or gated repo, make sure you are authenticated and your token has the required permissions.
2|gpu-api | For more details, see https://huggingface.co/docs/huggingface_hub/authentication
2|gpu-api | Invalid username or password.
2|gpu-api | The above exception was the direct cause of the following exception:
2|gpu-api | Traceback (most recent call last):
2|gpu-api | File "/home/ubuntu/worker/app/routes/image.py", line 143, in generate_image
2|gpu-api | return diffusion_service.generate_image(
2|gpu-api | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
2|gpu-api | File "/home/ubuntu/worker/app/services/diffusion.py", line 70, in generate_image
2|gpu-api | pipe = self.\_load_image_pipeline()
2|gpu-api | ^^^^^^^^^^^^^^^^^^^^^^^^^^^
2|gpu-api | File "/home/ubuntu/worker/app/services/diffusion.py", line 43, in \_load_image_pipeline
2|gpu-api | self.\_image_pipe = StableDiffusionPipeline.from_pretrained(
2|gpu-api | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/huggingface_hub/utils/\_validators.py", line 88, in \_inner_fn
2|gpu-api | return fn(*args, **kwargs)
2|gpu-api | ^^^^^^^^^^^^^^^^^^^
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/diffusers/pipelines/pipeline_utils.py", line 859, in from_pretrained
2|gpu-api | cached_folder = cls.download(
2|gpu-api | ^^^^^^^^^^^^^
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/huggingface_hub/utils/\_validators.py", line 88, in \_inner_fn
2|gpu-api | return fn(\*args, **kwargs)
2|gpu-api | ^^^^^^^^^^^^^^^^^^^
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/diffusers/pipelines/pipeline_utils.py", line 1824, in download
2|gpu-api | raise EnvironmentError(
2|gpu-api | OSError: Cannot load model stabilityai/stable-diffusion-2-1: model is not cached locally and an error occurred while trying to fetch metadata from the Hub. Please check out the root cause in the stacktrace above.
2|gpu-api | 2026-05-07 15:23:55,229 [INFO] httpx: HTTP Request: GET https://huggingface.co/api/models/stabilityai/stable-diffusion-2-1 "HTTP/1.1 401 Unauthorized"
2|gpu-api | Couldn't connect to the Hub: 401 Client Error. (Request ID: Root=1-69fcae8b-56c470f67449563e50cba1d2;ddfa77ca-b9d5-4c9b-a2d7-83cc246b29f2)
2|gpu-api | Repository Not Found for url: https://huggingface.co/api/models/stabilityai/stable-diffusion-2-1.
2|gpu-api | Please make sure you specified the correct `repo_id` and `repo_type`.
2|gpu-api | If you are trying to access a private or gated repo, make sure you are authenticated and your token has the required permissions.
2|gpu-api | For more details, see https://huggingface.co/docs/huggingface_hub/authentication
2|gpu-api | Invalid username or password..
2|gpu-api | Will try to load from local cache.
2|gpu-api | INFO: 102.89.82.237:51490 - "POST /generate/image HTTP/1.1" 500 Internal Server Error
2|gpu-api | ERROR: Exception in ASGI application
2|gpu-api | Traceback (most recent call last):
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/huggingface_hub/utils/\_http.py", line 761, in hf_raise_for_status
2|gpu-api | response.raise_for_status()
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/httpx/\_models.py", line 829, in raise_for_status
2|gpu-api | raise HTTPStatusError(message, request=request, response=self)
2|gpu-api | httpx.HTTPStatusError: Client error '401 Unauthorized' for url 'https://huggingface.co/api/models/stabilityai/stable-diffusion-2-1'
2|gpu-api | For more information check: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/401
2|gpu-api | The above exception was the direct cause of the following exception:
2|gpu-api | Traceback (most recent call last):
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/diffusers/pipelines/pipeline_utils.py", line 1643, in download
2|gpu-api | info = model_info(pretrained_model_name, token=token, revision=revision)
2|gpu-api | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/huggingface_hub/utils/\_validators.py", line 88, in \_inner_fn
2|gpu-api | return fn(*args, \*\*kwargs)
2|gpu-api | ^^^^^^^^^^^^^^^^^^^
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/huggingface_hub/hf_api.py", line 3209, in model_info
2|gpu-api | hf_raise_for_status(r)
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/huggingface_hub/utils/\_http.py", line 835, in hf_raise_for_status
2|gpu-api | raise \_format(RepositoryNotFoundError, message, response, repo_type=repo_type, repo_id=repo_id) from e
2|gpu-api | huggingface_hub.errors.RepositoryNotFoundError: 401 Client Error. (Request ID: Root=1-69fcae8b-62c5740967c8c3ac485bf2e3;31c78ffe-81e0-4786-848f-a0544e0ef7cb)
2|gpu-api | Repository Not Found for url: https://huggingface.co/api/models/stabilityai/stable-diffusion-2-1.
2|gpu-api | Please make sure you specified the correct `repo_id` and `repo_type`.
2|gpu-api | If you are trying to access a private or gated repo, make sure you are authenticated and your token has the required permissions.
2|gpu-api | For more details, see https://huggingface.co/docs/huggingface_hub/authentication
2|gpu-api | Invalid username or password.
2|gpu-api | The above exception was the direct cause of the following exception:
2|gpu-api | Traceback (most recent call last):
2|gpu-api | File "/home/ubuntu/worker/app/routes/image.py", line 143, in generate_image
2|gpu-api | return diffusion_service.generate_image(
2|gpu-api | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
2|gpu-api | File "/home/ubuntu/worker/app/services/diffusion.py", line 70, in generate_image
2|gpu-api | pipe = self.\_load_image_pipeline()
2|gpu-api | ^^^^^^^^^^^^^^^^^^^^^^^^^^^
2|gpu-api | File "/home/ubuntu/worker/app/services/diffusion.py", line 43, in \_load_image_pipeline
2|gpu-api | self.\_image_pipe = StableDiffusionPipeline.from_pretrained(
2|gpu-api | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/huggingface_hub/utils/\_validators.py", line 88, in \_inner_fn
2|gpu-api | return fn(*args, **kwargs)
2|gpu-api | ^^^^^^^^^^^^^^^^^^^
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/diffusers/pipelines/pipeline_utils.py", line 859, in from_pretrained
2|gpu-api | cached_folder = cls.download(
2|gpu-api | ^^^^^^^^^^^^^
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/huggingface_hub/utils/\_validators.py", line 88, in \_inner_fn
2|gpu-api | return fn(\*args, **kwargs)
2|gpu-api | ^^^^^^^^^^^^^^^^^^^
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/diffusers/pipelines/pipeline_utils.py", line 1824, in download
2|gpu-api | raise EnvironmentError(
2|gpu-api | OSError: Cannot load model stabilityai/stable-diffusion-2-1: model is not cached locally and an error occurred while trying to fetch metadata from the Hub. Please check out the root cause in the stacktrace above.
2|gpu-api | During handling of the above exception, another exception occurred:
2|gpu-api | Traceback (most recent call last):
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/huggingface_hub/utils/\_http.py", line 761, in hf_raise_for_status
2|gpu-api | response.raise_for_status()
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/httpx/\_models.py", line 829, in raise_for_status
2|gpu-api | raise HTTPStatusError(message, request=request, response=self)
2|gpu-api | httpx.HTTPStatusError: Client error '401 Unauthorized' for url 'https://huggingface.co/api/models/stabilityai/stable-diffusion-2-1'
2|gpu-api | For more information check: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/401
2|gpu-api | The above exception was the direct cause of the following exception:
2|gpu-api | Traceback (most recent call last):
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/diffusers/pipelines/pipeline_utils.py", line 1643, in download
2|gpu-api | info = model_info(pretrained_model_name, token=token, revision=revision)
2|gpu-api | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/huggingface_hub/utils/\_validators.py", line 88, in \_inner_fn
2|gpu-api | return fn(*args, **kwargs)
2|gpu-api | ^^^^^^^^^^^^^^^^^^^
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/huggingface_hub/hf_api.py", line 3209, in model_info
2|gpu-api | hf_raise_for_status(r)
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/huggingface_hub/utils/\_http.py", line 835, in hf_raise_for_status
2|gpu-api | raise \_format(RepositoryNotFoundError, message, response, repo_type=repo_type, repo_id=repo_id) from e
2|gpu-api | huggingface_hub.errors.RepositoryNotFoundError: 401 Client Error. (Request ID: Root=1-69fcae8b-56c470f67449563e50cba1d2;ddfa77ca-b9d5-4c9b-a2d7-83cc246b29f2)
2|gpu-api | Repository Not Found for url: https://huggingface.co/api/models/stabilityai/stable-diffusion-2-1.
2|gpu-api | Please make sure you specified the correct `repo_id` and `repo_type`.
2|gpu-api | If you are trying to access a private or gated repo, make sure you are authenticated and your token has the required permissions.
2|gpu-api | For more details, see https://huggingface.co/docs/huggingface_hub/authentication
2|gpu-api | Invalid username or password.
2|gpu-api | The above exception was the direct cause of the following exception:
2|gpu-api | Traceback (most recent call last):
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/uvicorn/protocols/http/h11_impl.py", line 415, in run_asgi
2|gpu-api | result = await app( # type: ignore[func-returns-value]
2|gpu-api | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/uvicorn/middleware/proxy_headers.py", line 56, in **call**
2|gpu-api | return await self.app(scope, receive, send)
2|gpu-api | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/fastapi/applications.py", line 1159, in **call**
2|gpu-api | await super().**call**(scope, receive, send)
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/starlette/applications.py", line 90, in **call**
2|gpu-api | await self.middleware_stack(scope, receive, send)
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/starlette/middleware/errors.py", line 186, in **call**
2|gpu-api | raise exc
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/starlette/middleware/errors.py", line 164, in **call**
2|gpu-api | await self.app(scope, receive, \_send)
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/starlette/middleware/cors.py", line 88, in **call**
2|gpu-api | await self.app(scope, receive, send)
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/starlette/middleware/exceptions.py", line 63, in **call**
2|gpu-api | await wrap_app_handling_exceptions(self.app, conn)(scope, receive, send)
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/starlette/\_exception_handler.py", line 53, in wrapped_app
2|gpu-api | raise exc
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/starlette/\_exception_handler.py", line 42, in wrapped_app
2|gpu-api | await app(scope, receive, sender)
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/fastapi/middleware/asyncexitstack.py", line 18, in **call**
2|gpu-api | await self.app(scope, receive, send)
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/starlette/routing.py", line 660, in **call**
2|gpu-api | await self.middleware_stack(scope, receive, send)
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/starlette/routing.py", line 680, in app
2|gpu-api | await route.handle(scope, receive, send)
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/starlette/routing.py", line 276, in handle
2|gpu-api | await self.app(scope, receive, send)
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/fastapi/routing.py", line 134, in app
2|gpu-api | await wrap_app_handling_exceptions(app, request)(scope, receive, send)
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/starlette/\_exception_handler.py", line 53, in wrapped_app
2|gpu-api | raise exc
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/starlette/\_exception_handler.py", line 42, in wrapped_app
2|gpu-api | await app(scope, receive, sender)
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/fastapi/routing.py", line 120, in app
2|gpu-api | response = await f(request)
2|gpu-api | ^^^^^^^^^^^^^^^^
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/fastapi/routing.py", line 674, in app
2|gpu-api | raw_response = await run_endpoint_function(
2|gpu-api | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/fastapi/routing.py", line 330, in run_endpoint_function
2|gpu-api | return await run_in_threadpool(dependant.call, **values)
2|gpu-api | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/starlette/concurrency.py", line 32, in run_in_threadpool
2|gpu-api | return await anyio.to_thread.run_sync(func)
2|gpu-api | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/anyio/to_thread.py", line 63, in run_sync
2|gpu-api | return await get_async_backend().run_sync_in_worker_thread(
2|gpu-api | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/anyio/\_backends/\_asyncio.py", line 2518, in run_sync_in_worker_thread
2|gpu-api | return await future
2|gpu-api | ^^^^^^^^^^^^
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/anyio/\_backends/\_asyncio.py", line 1002, in run
2|gpu-api | result = context.run(func, *args)
2|gpu-api | ^^^^^^^^^^^^^^^^^^^^^^^^
2|gpu-api | File "/home/ubuntu/worker/app/routes/image.py", line 154, in generate_image
2|gpu-api | return diffusion_service.generate_image(
2|gpu-api | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
2|gpu-api | File "/home/ubuntu/worker/app/services/diffusion.py", line 70, in generate_image
2|gpu-api | pipe = self.\_load_image_pipeline()
2|gpu-api | ^^^^^^^^^^^^^^^^^^^^^^^^^^^
2|gpu-api | File "/home/ubuntu/worker/app/services/diffusion.py", line 43, in \_load_image_pipeline
2|gpu-api | self.\_image_pipe = StableDiffusionPipeline.from_pretrained(
2|gpu-api | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/huggingface_hub/utils/\_validators.py", line 88, in \_inner_fn
2|gpu-api | return fn(*args, \*\*kwargs)
2|gpu-api | ^^^^^^^^^^^^^^^^^^^
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/diffusers/pipelines/pipeline_utils.py", line 859, in from_pretrained
2|gpu-api | cached_folder = cls.download(
2|gpu-api | ^^^^^^^^^^^^^
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/huggingface_hub/utils/\_validators.py", line 88, in \_inner_fn
2|gpu-api | return fn(*args, \*\*kwargs)
2|gpu-api | ^^^^^^^^^^^^^^^^^^^
2|gpu-api | File "/home/ubuntu/worker/venv/lib/python3.11/site-packages/diffusers/pipelines/pipeline_utils.py", line 1824, in download
2|gpu-api | raise EnvironmentError(
2|gpu-api | OSError: Cannot load model stabilityai/stable-diffusion-2-1: model is not cached locally and an error occurred while trying to fetch metadata from the Hub. Please check out the root cause in the stacktrace above.
2|gpu-api | INFO: 102.89.82.237:51492 - "GET /health HTTP/1.1" 200 OK
