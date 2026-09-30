import { Router } from 'express';
import { PrintController } from '../controllers/print.controller';
import { authenticate, requireStaff } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { orderIdParamSchema, printJobsSchema, printTokenSchema, testPrintSchema } from '../validators/print.validators';

const router = Router();

// Token printing is available to OWNER, MANAGER and CASHIER (permission `tokens.print`).
router.use(authenticate, requireStaff);

router.get('/status', authorize('tokens.print'), PrintController.status);
router.post('/test', authorize('tokens.print'), validate(testPrintSchema), PrintController.testPrint);
router.get('/jobs', authorize('tokens.print', 'audit.read'), validate(printJobsSchema), PrintController.jobs);
router.post('/orders/:orderId/token', authorize('tokens.print'), validate(printTokenSchema), PrintController.printToken);
router.get('/orders/:orderId/token/preview', authorize('tokens.print'), validate(orderIdParamSchema), PrintController.previewToken);

export default router;
