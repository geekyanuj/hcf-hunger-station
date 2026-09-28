import { Router } from 'express';
import { DashboardController } from '../controllers/dashboard.controller';
import { authenticate, requireStaff } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

const router = Router();

router.get('/overview', authenticate, requireStaff, authorize('analytics.read'), DashboardController.overview);

export default router;
