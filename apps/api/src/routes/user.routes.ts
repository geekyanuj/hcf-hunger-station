import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { authenticate, requireStaff } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

const router = Router();

router.get('/', authenticate, requireStaff, authorize('users.manage'), UserController.list);
router.post('/', authenticate, requireStaff, authorize('users.manage'), UserController.create);
router.patch('/:id', authenticate, requireStaff, authorize('users.manage'), UserController.update);
router.delete('/:id', authenticate, requireStaff, authorize('users.manage'), UserController.remove);
router.post('/:id/reset-password', authenticate, requireStaff, authorize('users.manage'), UserController.resetPassword);

export default router;
