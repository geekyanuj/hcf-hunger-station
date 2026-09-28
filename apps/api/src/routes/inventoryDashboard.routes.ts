import { Router } from 'express';
import { InventoryDashboardController } from '../controllers/inventoryDashboard.controller';
import { authenticate, requireStaff } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

const router = Router();

router.get('/summary', authenticate, requireStaff, authorize('reports.read'), InventoryDashboardController.summary);

export default router;
