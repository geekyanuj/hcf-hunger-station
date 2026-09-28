import { Router } from 'express';
import { AuditController } from '../controllers/audit.controller';
import { authenticate, requireStaff } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

const router = Router();

router.get('/', authenticate, requireStaff, authorize('audit.read'), AuditController.list);

export default router;
