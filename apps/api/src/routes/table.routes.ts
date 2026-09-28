import { Router } from 'express';
import { TableController } from '../controllers/table.controller';
import { authenticate, requireStaff } from '../middleware/authenticate';
import { authorize, authorizeAny } from '../middleware/authorize';

const router = Router();

// POS staff (orders.create) need to read the table list to seat a Dine order; only tables.manage can change tables.
router.get('/', authenticate, requireStaff, authorizeAny('tables.manage', 'orders.create'), TableController.list);
router.post('/', authenticate, requireStaff, authorize('tables.manage'), TableController.create);
router.patch('/:id', authenticate, requireStaff, authorize('tables.manage'), TableController.update);
router.patch('/:id/regenerate-qr', authenticate, requireStaff, authorize('tables.manage'), TableController.regenerateQr);
router.delete('/:id', authenticate, requireStaff, authorize('tables.manage'), TableController.remove);

export default router;
