import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller';
import { authenticate } from '../middleware/authenticate';

const router = Router();

router.get('/', authenticate, NotificationController.list);
router.post('/:id/read', authenticate, NotificationController.markRead);
router.post('/mark-all-read', authenticate, NotificationController.markAllRead);

export default router;
