import { Router } from 'express';
import { OrderController } from '../controllers/order.controller';
import { optionalAuthenticate, authenticate, requireStaff } from '../middleware/authenticate';
import { authorize, authorizeAny } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { createOrderSchema, priceCartSchema, updateOrderStatusSchema, cancelOrderSchema } from '../validators/order.validators';

const router = Router();

// Orders can be placed by an authenticated customer, staff (POS), or a guest
// dine-in/takeaway session - hence optionalAuthenticate rather than a hard requirement.
router.post('/', optionalAuthenticate, validate(createOrderSchema), OrderController.create);
router.post('/price', optionalAuthenticate, validate(priceCartSchema), OrderController.priceCart);

router.get('/', authenticate, requireStaff, authorize('orders.read'), OrderController.listForOutlet);
// Must stay above '/:id' so "current" is not treated as an order id.
router.get('/current', authenticate, requireStaff, authorize('orders.read'), OrderController.current);
router.get('/:id', optionalAuthenticate, OrderController.getById);
router.get('/:id/status', optionalAuthenticate, OrderController.getStatus);
router.post('/:id/cancel', optionalAuthenticate, validate(cancelOrderSchema), OrderController.cancel);
router.post('/:id/reorder', optionalAuthenticate, OrderController.reorder);
router.get('/:id/receipt', optionalAuthenticate, OrderController.receipt);

// Several roles use this endpoint (cashier/manager: orders.update, kitchen: kds.update, delivery
// executive: delivery.update). WHICH transition each of them may perform is decided centrally by the
// order state machine (services/orderStateMachine.ts), not here.
router.patch(
  '/:id/status',
  authenticate,
  requireStaff,
  authorizeAny('orders.update', 'kds.update', 'delivery.update'),
  validate(updateOrderStatusSchema),
  OrderController.updateStatus
);

export default router;
