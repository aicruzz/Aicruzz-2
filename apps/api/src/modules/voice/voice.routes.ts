import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { requireLegalConsent } from '../../middleware/legal.middleware';
import {
  generateVoiceValidator,
  cloneVoiceValidator,
  linkVoiceValidator,
} from './voice.validators';
import * as voiceController from './voice.controller';

const router = Router();

// Auth + existing legal-consent system preserved (unchanged middleware).
router.use(authenticate);
router.use(requireLegalConsent('VOICE'));

// POST /api/voice/generate — AI voice / saved voice / presets / emotion
router.post('/generate', generateVoiceValidator, validate, voiceController.generateVoice);

// POST /api/voice/clone — consent-gated voice cloning → saved reusable voice
router.post('/clone', cloneVoiceValidator, validate, voiceController.cloneVoice);

// GET /api/voice/saved — reusable saved voices (user_assets type VOICE)
router.get('/saved', voiceController.listSavedVoices);

// POST /api/voice/link — link a saved voice to a custom character
router.post('/link', linkVoiceValidator, validate, voiceController.linkVoice);

// DELETE /api/voice/link/:characterId — remove the link
router.delete('/link/:characterId', voiceController.unlinkVoice);

export { router as voiceRouter };
