import { Router } from 'express';
import { CouponController } from '../controllers/coupon.controller';
import { authenticate, requireStaff } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { createCouponSchema, updateCouponSchema } from '../validators/growth.validators';

const router = Router();

router.get('/', authenticate, requireStaff, authorize('coupons.manage'), CouponController.list);
router.get('/:id', authenticate, requireStaff, authorize('coupons.manage'), CouponController.getById);
router.post('/', authenticate, requireStaff, authorize('coupons.manage'), validate(createCouponSchema), CouponController.create);
router.patch('/:id', authenticate, requireStaff, authorize('coupons.manage'), validate(updateCouponSchema), CouponController.update);
router.delete('/:id', authenticate, requireStaff, authorize('coupons.manage'), CouponController.remove);

export default router;
