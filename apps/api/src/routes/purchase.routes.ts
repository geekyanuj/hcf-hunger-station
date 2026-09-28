import { Router } from 'express';
import { PurchaseController } from '../controllers/purchase.controller';
import { authenticate, requireStaff } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { createPurchaseSchema } from '../validators/inventory.validators';

const router = Router();

router.get('/', authenticate, requireStaff, authorize('purchases.manage'), PurchaseController.list);
router.get('/:id', authenticate, requireStaff, authorize('purchases.manage'), PurchaseController.getById);
router.post('/', authenticate, requireStaff, authorize('purchases.manage'), validate(createPurchaseSchema), PurchaseController.create);
router.post('/:id/complete', authenticate, requireStaff, authorize('purchases.manage'), PurchaseController.complete);
router.post('/:id/cancel', authenticate, requireStaff, authorize('purchases.manage'), PurchaseController.cancel);
router.patch('/:id/payment-status', authenticate, requireStaff, authorize('purchases.manage'), PurchaseController.updatePaymentStatus);

export default router;
