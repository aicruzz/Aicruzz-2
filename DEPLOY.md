# Production Deployment Guide

## Prerequisites
- Linux server with Docker + docker-compose
- Domain with DNS pointing to your server
- SSL certificates (Let's Encrypt recommended)
- Stripe account in live mode
- AI provider accounts (OpenAI, Anthropic, ElevenLabs, Runway, Pika)
- Optional: NVIDIA GPU + nvidia-docker for local AI processing

---

## 1. Server setup

```bash
# Install Docker (Ubuntu 22.04+)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
sudo apt install -y docker-compose-plugin

# Optional: NVIDIA Container Toolkit for GPU
distribution=$(. /etc/os-release; echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/libnvidia-container/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt update && sudo apt install -y nvidia-container-toolkit
sudo systemctl restart docker
```

## 2. Clone & configure

```bash
git clone <your-repo> /opt/aicruzz && cd /opt/aicruzz

# Production environment file at the root
cp .env.example .env
nano .env  # fill EVERYTHING — see "Required env vars" below

# Per-service .env files
cp .env apps/api/.env
cp apps/ai-router/.env apps/ai-router/.env.prod
cp apps/webrtc/.env apps/webrtc/.env.prod
```

## 3. Required env vars

```bash
# Server
NODE_ENV=production
CORS_ORIGIN=https://app.your-domain.com,https://your-domain.com
WEB_URL=https://app.your-domain.com

# Database (set strong passwords)
POSTGRES_USER=aicruzz_prod
POSTGRES_PASSWORD=<strong-password-32-chars>
POSTGRES_DB=aicruzz_prod
DATABASE_URL=postgresql://aicruzz_prod:<password>@postgres:5432/aicruzz_prod

# Redis
REDIS_PASSWORD=<strong-password>
REDIS_URL=redis://:<password>@redis:6379

# JWT (generate with: openssl rand -base64 48)
JWT_SECRET=<48+ chars random>
JWT_EXPIRES_IN=7d

# Stripe live mode
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_DEVELOPER_BASIC=price_...     # create in Stripe dashboard
STRIPE_PRICE_DEVELOPER_PRO=price_...
STRIPE_PRICE_DEVELOPER_ELITE=price_...

# AI providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
ELEVENLABS_API_KEY=...
RUNWAY_API_KEY=...
PIKA_API_KEY=...

# Crypto wallets (your receiving addresses)
ADMIN_WALLET_BTC=bc1q...
ADMIN_WALLET_USDT=T...

# AI Router shared secret (generate strong random)
AI_ROUTER_SECRET=<32+ chars random>

# WebRTC
WEBRTC_ANNOUNCED_IP=<public IP of your server>

# Frontend public vars
NEXT_PUBLIC_API_URL=https://api.your-domain.com
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
NEXT_PUBLIC_WEBRTC_WS_URL=wss://webrtc.your-domain.com
```

## 4. SSL / Nginx

Create `nginx/conf.d/aicruzz.conf`:

```nginx
upstream api { server api:4000; }
upstream web { server web:3000; }

server {
    listen 80;
    server_name your-domain.com app.your-domain.com api.your-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name app.your-domain.com;
    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;

    location / { proxy_pass http://web; proxy_set_header Host $host; }
}

server {
    listen 443 ssl http2;
    server_name api.your-domain.com;
    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;

    client_max_body_size 250M;  # for video uploads

    location / {
        proxy_pass http://api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    # Stripe webhook needs raw body
    location /api/billing/stripe/webhook {
        proxy_pass http://api;
        proxy_pass_request_body on;
    }

    location /uploads {
        alias /var/www/uploads;
        expires 7d;
    }
}
```

Issue Let's Encrypt certs:

```bash
sudo apt install -y certbot
sudo certbot certonly --standalone -d your-domain.com -d app.your-domain.com -d api.your-domain.com
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem /opt/aicruzz/nginx/ssl/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem /opt/aicruzz/nginx/ssl/
```

## 5. Start the stack

```bash
cd /opt/aicruzz
docker-compose -f docker-compose.prod.yml up -d --build
docker-compose -f docker-compose.prod.yml logs -f api
```

## 6. Initialize database

```bash
docker exec aicruzz_api npx prisma migrate deploy
docker exec aicruzz_api npx ts-node prisma/seed.ts
```

## 7. Configure Stripe webhook

In Stripe dashboard:
1. Add webhook endpoint: `https://api.your-domain.com/api/billing/stripe/webhook`
2. Listen to: `payment_intent.succeeded`, `payment_intent.payment_failed`, `customer.subscription.*`, `checkout.session.completed`
3. Copy signing secret → set as `STRIPE_WEBHOOK_SECRET`
4. Restart API: `docker-compose -f docker-compose.prod.yml restart api`

## 8. Create Stripe subscription products

In Stripe dashboard, create 3 recurring products:
- Developer Basic — $19/month
- Developer Pro — $49/month
- Developer Elite — $99/month

Copy each price ID into `.env` as `STRIPE_PRICE_DEVELOPER_*`.

## 9. Verify

```bash
# Health checks
curl https://api.your-domain.com/health
curl https://api.your-domain.com/health/ready

# Open the web app
open https://app.your-domain.com
```

Log in with seeded admin credentials and immediately:
1. Change admin password
2. Test wallet funding flow with Stripe test card
3. Test legal consent flow on each module
4. Verify webhook delivery in Stripe dashboard

---

## Operational

### Logs
```bash
docker-compose -f docker-compose.prod.yml logs -f api
docker exec aicruzz_api tail -f logs/combined.log
```

### Backup
```bash
# Daily DB backup
docker exec aicruzz_postgres pg_dump -U $POSTGRES_USER $POSTGRES_DB | gzip > backup-$(date +%F).sql.gz
```

### Scaling
- API/AI-router/Web are stateless → horizontal scale freely
- Postgres: read replicas
- Redis: Sentinel or cluster mode
- WebRTC: pin clients to instance via sticky session OR run dedicated instances per region
- Worker: scale per GPU available

### Monitoring
- Liveness: `GET /health` → 200 OK
- Readiness: `GET /health/ready` → 200 (ok or degraded), 503 (down)
- Track DB latency, Redis latency, AI provider error rates from `activity_logs`
