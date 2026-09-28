import { Router } from 'express';
import { KitchenController } from '../controllers/kitchen.controller';
import { authenticate, requireStaff } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

const router = Router();

router.get('/board', authenticate, requireStaff, authorize('kds.read'), KitchenController.board);
router.get('/workload', authenticate, requireStaff, authorize('kds.read'), KitchenController.workload);

export default router;
