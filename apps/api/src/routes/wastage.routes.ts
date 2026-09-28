import { Router } from 'express';
import { WastageController } from '../controllers/wastage.controller';
import { authenticate, requireStaff } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { createWastageSchema } from '../validators/inventory.validators';

const router = Router();

router.get('/', authenticate, requireStaff, authorize('wastage.manage'), WastageController.list);
router.post('/', authenticate, requireStaff, authorize('wastage.manage'), validate(createWastageSchema), WastageController.create);

export default router;
