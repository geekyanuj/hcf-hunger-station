import { Router } from 'express';
import { DashboardController } from '../controllers/dashboard.controller';
import { authenticate, requireStaff } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { authRateLimiter } from '../middleware/security';
import { dashboardResetSchema } from '../validators/auth.validators';

const router = Router();

router.get('/overview', authenticate, requireStaff, authorize('analytics.read'), DashboardController.overview);

router.post('/reset', authenticate, requireStaff, authRateLimiter, authorize('dashboard.reset'), validate(dashboardResetSchema), DashboardController.reset);

export default router;
