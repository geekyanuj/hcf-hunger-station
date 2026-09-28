import { Router } from 'express';
import { SupplierController } from '../controllers/supplier.controller';
import { authenticate, requireStaff } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { createSupplierSchema } from '../validators/inventory.validators';

const router = Router();

router.get('/', authenticate, requireStaff, authorize('suppliers.manage'), SupplierController.list);
router.get('/:id', authenticate, requireStaff, authorize('suppliers.manage'), SupplierController.getById);
router.get('/:id/products', authenticate, requireStaff, authorize('suppliers.manage'), SupplierController.products);
router.post('/', authenticate, requireStaff, authorize('suppliers.manage'), validate(createSupplierSchema), SupplierController.create);
router.patch('/:id', authenticate, requireStaff, authorize('suppliers.manage'), SupplierController.update);
router.delete('/:id', authenticate, requireStaff, authorize('suppliers.manage'), SupplierController.remove);

export default router;
