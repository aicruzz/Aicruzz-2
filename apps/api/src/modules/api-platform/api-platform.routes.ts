import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  createApiKeyValidator,
  subscribePlanValidator,
  apiKeyIdValidator,
} from './api-platform.validators';
import * as controller from './api-platform.controller';

const router = Router();

// Public — anyone can browse plans
router.get('/plans', controller.listPlans);

// Authenticated routes
router.use(authenticate);

// API keys
router.get('/keys', controller.listApiKeys);
router.post('/keys', createApiKeyValidator, validate, controller.createApiKey);
router.post('/keys/:keyId/revoke', apiKeyIdValidator, validate, controller.revokeApiKey);
router.delete('/keys/:keyId', apiKeyIdValidator, validate, controller.deleteApiKey);

// Subscription
router.get('/subscription', controller.getSubscription);
router.post('/subscribe', subscribePlanValidator, validate, controller.subscribe);
router.post('/subscription/cancel', controller.cancelSubscription);
router.post('/subscription/resume', controller.resumeSubscription);

export { router as apiPlatformRouter };
