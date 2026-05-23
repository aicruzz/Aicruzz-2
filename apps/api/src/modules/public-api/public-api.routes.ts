import { Router } from 'express';
import { publicApiAuth } from './public-api.middleware';
import * as controller from './public-api.controller';

const router = Router();

// All /v1/* routes require API key auth + rate limit + monthly quota
router.use(publicApiAuth);

// Synchronous AI endpoints
router.post('/chat/completions', controller.chatCompletion);
router.post('/image/generate', controller.imageGenerate);
router.post('/voice/generate', controller.voiceGenerate);

// Async AI endpoints (return job ID)
router.post('/video/generate', controller.videoGenerate);
router.post('/cartoon/generate', controller.cartoonGenerate);

// Job status polling
router.get('/jobs/:jobId', controller.getJobStatus);

// Usage stats
router.get('/usage', controller.getUsage);

export { router as publicApiRouter };
