import { Request, Response } from 'express';
import * as service from './api-platform.service';
import { sendSuccess, sendCreated } from '../../utils/response';
import { PLAN_CONFIG } from './api-platform.types';
import type { ApiPlan } from './api-platform.types';

// ─── PLANS LIST (public) ──────────────────────────────────────

export async function listPlans(_req: Request, res: Response): Promise<void> {
  const plans = (Object.keys(PLAN_CONFIG) as ApiPlan[]).map((id) => ({
    id,
    ...PLAN_CONFIG[id],
  }));
  sendSuccess(res, plans, 'Plans retrieved');
}

// ─── API KEYS ─────────────────────────────────────────────────

export async function createApiKey(req: Request, res: Response): Promise<void> {
  const result = await service.createApiKey(req.user!.userId, req.body);
  sendCreated(res, result, 'API key created — copy it now, it will not be shown again');
}

export async function listApiKeys(req: Request, res: Response): Promise<void> {
  const keys = await service.listApiKeys(req.user!.userId);
  sendSuccess(res, keys, 'API keys retrieved');
}

export async function revokeApiKey(req: Request, res: Response): Promise<void> {
  await service.revokeApiKey(req.user!.userId, req.params.keyId);
  sendSuccess(res, null, 'API key revoked');
}

export async function deleteApiKey(req: Request, res: Response): Promise<void> {
  await service.deleteApiKey(req.user!.userId, req.params.keyId);
  sendSuccess(res, null, 'API key deleted');
}

// ─── SUBSCRIPTION ─────────────────────────────────────────────

export async function getSubscription(req: Request, res: Response): Promise<void> {
  const sub = await service.getSubscription(req.user!.userId);
  sendSuccess(res, sub, 'Subscription retrieved');
}

export async function subscribe(req: Request, res: Response): Promise<void> {
  const { plan } = req.body as { plan: ApiPlan };
  const result = await service.createOrUpgradeSubscription(
    req.user!.userId,
    req.user!.email,
    plan,
  );
  sendCreated(res, result, 'Stripe checkout session created');
}

export async function cancelSubscription(req: Request, res: Response): Promise<void> {
  await service.cancelSubscription(req.user!.userId);
  sendSuccess(res, null, 'Subscription will cancel at the end of current period');
}

export async function resumeSubscription(req: Request, res: Response): Promise<void> {
  await service.resumeSubscription(req.user!.userId);
  sendSuccess(res, null, 'Subscription resumed');
}
