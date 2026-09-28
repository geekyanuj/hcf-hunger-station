import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/authenticate';
import { authRateLimiter } from '../middleware/security';
import {
  staffLoginSchema,
  customerLoginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from '../validators/auth.validators';

const router = Router();

router.post('/staff/login', authRateLimiter, validate(staffLoginSchema), AuthController.staffLogin);
router.post('/customer/login', authRateLimiter, validate(customerLoginSchema), AuthController.customerLogin);
router.post('/refresh', validate(refreshSchema), AuthController.refresh);
router.post('/logout', AuthController.logout);
router.post('/forgot-password', authRateLimiter, validate(forgotPasswordSchema), AuthController.forgotPassword);
router.post('/reset-password', authRateLimiter, validate(resetPasswordSchema), AuthController.resetPassword);
router.post('/change-password', authenticate, validate(changePasswordSchema), AuthController.changePassword);
router.get('/me', authenticate, AuthController.me);

export default router;
