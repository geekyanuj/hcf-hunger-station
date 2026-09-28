import { Router } from 'express';
import { PaymentController } from '../controllers/payment.controller';
import { optionalAuthenticate, authenticate, requireStaff } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

const router = Router();

router.post('/', optionalAuthenticate, PaymentController.initiate);
router.post('/webhook', PaymentController.webhook); // called by the payment gateway itself, no user auth
router.post('/refund', authenticate, requireStaff, authorize('payments.refund'), PaymentController.refund);
router.post('/dev/simulate-webhook', authenticate, requireStaff, PaymentController.devSimulateWebhook);
router.get('/order/:orderId', optionalAuthenticate, PaymentController.listForOrder);

export default router;
