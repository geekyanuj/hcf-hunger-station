import { Router } from 'express';
import { InventoryController } from '../controllers/inventory.controller';
import { authenticate, requireStaff } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { createInventoryItemSchema, updateInventoryItemSchema, adjustStockSchema } from '../validators/inventory.validators';

const router = Router();

router.get('/', authenticate, requireStaff, authorize('inventory.read'), InventoryController.list);
router.get('/ledger', authenticate, requireStaff, authorize('inventory.read'), InventoryController.ledgerForOutlet);
router.get('/:id', authenticate, requireStaff, authorize('inventory.read'), InventoryController.getById);
router.get('/:id/ledger', authenticate, requireStaff, authorize('inventory.read'), InventoryController.ledgerForItem);
router.post('/', authenticate, requireStaff, authorize('inventory.write'), validate(createInventoryItemSchema), InventoryController.create);
router.patch('/:id', authenticate, requireStaff, authorize('inventory.write'), validate(updateInventoryItemSchema), InventoryController.update);
router.delete('/:id', authenticate, requireStaff, authorize('inventory.write'), InventoryController.remove);
router.post('/:id/adjust', authenticate, requireStaff, authorize('inventory.write'), validate(adjustStockSchema), InventoryController.adjustStock);

export default router;
