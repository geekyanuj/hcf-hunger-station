import { Router } from 'express';
import { ExportController } from '../controllers/export.controller';
import { authenticate, requireStaff } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

const router = Router();

router.get('/orders.csv', authenticate, requireStaff, authorize('exports.read'), ExportController.orders);
router.get('/inventory.csv', authenticate, requireStaff, authorize('exports.read'), ExportController.inventory);
router.get('/purchases.csv', authenticate, requireStaff, authorize('exports.read'), ExportController.purchases);
router.get('/wastage.csv', authenticate, requireStaff, authorize('exports.read'), ExportController.wastage);
router.get('/customers.csv', authenticate, requireStaff, authorize('customers.manage'), ExportController.customers);

export default router;
