import { Router } from 'express';
import { OutletController } from '../controllers/outlet.controller';
import { authenticate, requireStaff } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

const router = Router();

router.get('/', OutletController.list); // public - customers need this to pick an outlet
router.get('/:id', OutletController.getById);
router.post('/', authenticate, requireStaff, authorize('outlets.manage'), OutletController.create);
router.patch('/:id', authenticate, requireStaff, authorize('outlets.manage'), OutletController.update);
router.delete('/:id', authenticate, requireStaff, authorize('outlets.manage'), OutletController.remove);

export default router;
