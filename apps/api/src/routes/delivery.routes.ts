import { Router } from 'express';
import { DeliveryController } from '../controllers/delivery.controller';
import { authenticate, requireStaff } from '../middleware/authenticate';
import { authorize, authorizeAny } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { assignDeliverySchema } from '../validators/order.validators';

const router = Router();

router.get('/unassigned', authenticate, requireStaff, authorize('delivery.assign'), DeliveryController.unassigned);
router.get('/executives', authenticate, requireStaff, authorize('delivery.assign'), DeliveryController.executives);
router.get('/in-flight', authenticate, requireStaff, authorize('delivery.assign'), DeliveryController.inFlight);
router.post('/:orderId/assign', authenticate, requireStaff, authorize('delivery.assign'), validate(assignDeliverySchema), DeliveryController.assign);
router.post('/:orderId/picked-up', authenticate, requireStaff, authorizeAny('delivery.update', 'delivery.assign'), DeliveryController.pickedUp);
router.get('/my-orders', authenticate, requireStaff, authorize('delivery.read'), DeliveryController.myOrders);

export default router;
