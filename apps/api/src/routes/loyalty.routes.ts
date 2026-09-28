import { Router } from 'express';
import { LoyaltyController } from '../controllers/loyalty.controller';
import { authenticate, requireStaff, requireCustomer } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { upsertLoyaltyConfigSchema } from '../validators/growth.validators';

const router = Router();

router.get('/config', LoyaltyController.getConfig); // public - customer app needs to display earn/redeem rates
router.post('/config', authenticate, requireStaff, authorize('loyalty.manage'), validate(upsertLoyaltyConfigSchema), LoyaltyController.upsertConfig);
router.get('/me', authenticate, requireCustomer, LoyaltyController.myBalance);
router.get('/me/history', authenticate, requireCustomer, LoyaltyController.myHistory);
router.post('/me/preview-redeem', authenticate, requireCustomer, LoyaltyController.previewRedemption);
router.post('/adjust', authenticate, requireStaff, authorize('loyalty.manage'), LoyaltyController.adjust);

export default router;
