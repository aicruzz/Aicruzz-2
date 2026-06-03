
import { Request, Response } from 'express';
import * as cartoonService from './cartoon.service';
import { sendSuccess, sendCreated } from '../../utils/response';
import type { CartoonType, JobStatus, WebhookBody } from './cartoon.types';
 

export async function createTemplate(req: Request, res: Response): Promise<void> {
  const tpl = await cartoonService.createTemplate(req.user!.userId, req.body);
  sendCreated(res, tpl, 'Template created');
}

export async function getTemplate(req: Request, res: Response): Promise<void> {
  const tpl = await cartoonService.getTemplate(req.params.templateId, req.user!.userId);
  sendSuccess(res, tpl, 'Template retrieved');
}

export async function listTemplates(req: Request, res: Response): Promise<void> {
  const includePublic = req.query.public !== 'false';
  const templates = await cartoonService.listTemplates(req.user!.userId, includePublic);
  sendSuccess(res, templates, 'Templates retrieved');
}

export async function updateTemplate(req: Request, res: Response): Promise<void> {
  const tpl = await cartoonService.updateTemplate(req.params.templateId, req.user!.userId, req.body);
  sendSuccess(res, tpl, 'Template updated');
}

export async function deleteTemplate(req: Request, res: Response): Promise<void> {
  await cartoonService.deleteTemplate(req.params.templateId, req.user!.userId);
  sendSuccess(res, null, 'Template deleted');
}


export async function addScene(req: Request, res: Response): Promise<void> {
  const scene = await cartoonService.addScene(req.params.templateId, req.user!.userId, req.body);
  sendCreated(res, scene, 'Scene added');
}

export async function updateScene(req: Request, res: Response): Promise<void> {
  const scene = await cartoonService.updateScene(
    req.params.sceneId, req.params.templateId, req.user!.userId, req.body,
  );
  sendSuccess(res, scene, 'Scene updated');
}

export async function deleteScene(req: Request, res: Response): Promise<void> {
  await cartoonService.deleteScene(req.params.sceneId, req.params.templateId, req.user!.userId);
  sendSuccess(res, null, 'Scene deleted');
}

export async function reorderScenes(req: Request, res: Response): Promise<void> {
  const { orderedIds } = req.body as { orderedIds: string[] };
  await cartoonService.reorderScenes(req.params.templateId, req.user!.userId, orderedIds);
  sendSuccess(res, null, 'Scenes reordered');
}

// ─── GENERATION ───────────────────────────────────────────────

export async function generateCartoon(req: Request, res: Response): Promise<void> {
  const job = await cartoonService.generateCartoon(req.user!.userId, req.body);
  sendCreated(res, job, 'Cartoon generation started');
}

export async function estimateCredits(req: Request, res: Response): Promise<void> {
  const type = (req.query.type as CartoonType) ?? 'CUSTOM';
  const durationSecs = req.query.duration ? parseFloat(req.query.duration as string) : undefined;
  const credits = cartoonService.estimateCredits(type, durationSecs);
  sendSuccess(res, { credits, type, durationSecs }, 'Credit estimate');
}

export async function listJobs(req: Request, res: Response): Promise<void> {
  const page  = parseInt(req.query.page  as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const status = req.query.status as JobStatus | undefined;
  const type   = req.query.type   as CartoonType | undefined;
  const result = await cartoonService.listJobs(req.user!.userId, page, limit, status, type);
  sendSuccess(res, result.jobs, 'Jobs retrieved', 200, {
    page, limit, total: result.total, totalPages: result.totalPages,
  });
}

export async function getJobStatus(req: Request, res: Response): Promise<void> {
  const job = await cartoonService.getJobStatus(req.params.jobId, req.user!.userId);
  sendSuccess(res, job, 'Job status');
}

export async function cancelJob(req: Request, res: Response): Promise<void> {
  await cartoonService.cancelJob(req.params.jobId, req.user!.userId);
  sendSuccess(res, null, 'Job cancelled and credits refunded');
}

// ─── PHASE 3: SAVE-AS WORKFLOWS ───────────────────────────────

export async function saveJobAsTemplate(req: Request, res: Response): Promise<void> {
  const tpl = await cartoonService.saveJobAsTemplate(
    req.user!.userId,
    req.params.jobId,
    req.body,
  );
  sendCreated(res, tpl, 'Template saved from job');
}

export async function saveJobAsCharacter(req: Request, res: Response): Promise<void> {
  const character = await cartoonService.saveJobAsCharacter(
    req.user!.userId,
    req.params.jobId,
    req.body,
  );
  sendCreated(res, character, 'Character saved from job');
}

export async function saveJobAsAsset(req: Request, res: Response): Promise<void> {
  const asset = await cartoonService.saveJobOutputAsAsset(
    req.user!.userId,
    req.params.jobId,
    req.body,
  );
  sendCreated(res, asset, 'Asset saved from job');
}

// ─── WEBHOOK (internal) ───────────────────────────────────────

export async function handleWebhook(req: Request, res: Response): Promise<void> {
  const { jobId } = req.params;
  const body = req.body as WebhookBody;

  console.log('Cartoon webhook raw body:', JSON.stringify(body, null, 2));

  res.json({ received: true });

  await cartoonService.handleWebhook(jobId, {
    success:               body.success,
    routerStatus:          body.result?.raw?.status ?? (body.success ? 'COMPLETED' : 'FAILED'),
    outputUrl:             body.result?.raw?.output_url,
    thumbnailUrl:          body.result?.raw?.thumbnail_url,
    provider:              body.result?.provider,
    actualDurationSeconds: body.result?.raw?.duration_seconds,
    error:                 body.result?.raw?.error,
    diagnostics:           body.diagnostics ?? null,
  });
}